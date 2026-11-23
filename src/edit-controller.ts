import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KeyEvent } from "@opentui/core";
import type { ConflictAction, DocFormat, EditModel, PromptAction, PromptReason } from "$types/edit.ts";
import type { DiffRow } from "$types/observe.ts";
import { contextRows, diffLines, splitLines } from "./observe/diff.ts";
import type { SessionChanges } from "./observe/session-changes.ts";
import { readText } from "./observe/watcher.ts";
import { EditHistory, parseDoc, serializeDoc } from "./ui/edit-buffer.ts";
import type { createEditSurface } from "./ui/editor-textarea.ts";

const PAGE_LINES = 10;

/**
 * Edit mode of the editor pane: the file as it is on disk, my changes, undo/redo, ctrl+s, and what happens when
 * claude writes the same file or I try to leave with unsaved text.
 */
export function createEditController(deps: {
	root: string;
	surface: ReturnType<typeof createEditSurface>;
	changes: SessionChanges;
	now: () => number;
	render: () => void;
	/** edit mode started or needs the user: pause follow, show and focus the editor on `path` */
	onStart: (path: string) => void;
}) {
	const { surface } = deps;
	let session: { path: string; format: DocFormat; disk: string } | null = null;
	let history = new EditHistory({ text: "", cursor: 0 });
	let conflict: { raw: string; text: string; showingDiff: boolean; rows: DiffRow[] } | null = null;
	let prompt: PromptReason | null = null;
	let afterPrompt: (() => void) | null = null;
	let exitWaiter: (() => void) | null = null;
	let readOnly: string | null = null;

	const dirty = () => session !== null && surface.snapshot().text !== session.disk;

	const stop = () => {
		session = null;
		conflict = null;
		prompt = null;
		afterPrompt = null;
		deps.render();
		const waiter = exitWaiter;
		exitWaiter = null;
		waiter?.();
	};

	const load = (text: string, cursor: number) => {
		surface.set({ text, cursor });
		history = new EditHistory(surface.snapshot());
	};

	const save = async () => {
		if (!session) return;
		const { path, format } = session;
		const text = surface.snapshot().text;
		const raw = serializeDoc(text, format);
		await writeFile(join(deps.root, path), raw);
		session.disk = text;
		conflict = null;
		deps.changes.apply({ path, content: raw, byClaude: false, byYou: true, tool: "phdterm", at: deps.now() });
		// claude already left: once nothing is unsaved, phdterm can close
		if (exitWaiter) return stop();
		deps.render();
	};

	const ask = (reason: PromptReason, then: (() => void) | null) => {
		prompt = reason;
		afterPrompt = then;
		deps.render();
	};

	const answer = async (action: PromptAction) => {
		if (action === "cancel") {
			prompt = null;
			afterPrompt = null;
			return deps.render();
		}
		if (action === "save") await save();
		const then = afterPrompt;
		stop();
		then?.();
	};

	const resolveConflict = async (action: ConflictAction) => {
		if (!session || !conflict) return;
		if (action === "diff") {
			conflict.showingDiff = !conflict.showingDiff;
			return deps.render();
		}
		if (action === "keep") return save();
		const { raw, text } = conflict;
		conflict = null;
		session.disk = text;
		session.format = parseDoc(raw).format;
		load(text, surface.snapshot().cursor);
		deps.render();
	};

	/** Runs `action` (it moves the editor off the edited file) once no unsaved text would be lost, asking first. */
	const guard = (action: () => void, reason: PromptReason = "switch") => {
		if (!session) return action();
		if (!dirty()) {
			stop();
			return action();
		}
		deps.onStart(session.path);
		ask(reason, action);
	};

	/** `i` or a double click: edit `path` from disk with the cursor on the 1-based `line`. */
	const enter = async (path: string, line: number): Promise<void> => {
		if (session?.path === path) return;
		// another file is being edited: its unsaved text is settled first
		if (session) return guard(() => void enter(path, line), "switch");
		const raw = await readText(join(deps.root, path));
		if (raw === null) {
			readOnly = path;
			return deps.render();
		}
		const { text, format } = parseDoc(raw);
		session = { path, format, disk: text };
		surface.load(text, line);
		history = new EditHistory(surface.snapshot());
		deps.onStart(path);
		deps.render();
	};

	const step = (snapshot: ReturnType<EditHistory["undo"]>) => {
		if (snapshot) surface.set(snapshot);
		deps.render();
	};

	return {
		active: () => session !== null,
		dirty,
		model(path: string | null): EditModel {
			const active = session !== null && session.path === path;
			return {
				active,
				dirty: active && dirty(),
				conflict: active && conflict ? { showingDiff: conflict.showingDiff, rows: conflict.rows } : null,
				prompt: active ? prompt : null,
				readOnly: path !== null && readOnly === path,
			};
		},
		enter,
		/** Keys on the edit surface before it handles them; anything not taken here is typing. */
		key(key: KeyEvent) {
			if (!session) return;
			const take = () => key.preventDefault();
			if (prompt) {
				take();
				const plain = !key.ctrl && !key.meta;
				if (plain && key.name === "s") void answer("save");
				else if (plain && key.name === "d") void answer("discard");
				else if (key.name === "escape" || (plain && key.name === "c")) void answer("cancel");
				return;
			}
			if (conflict?.showingDiff) {
				take();
				if (key.name === "escape") void resolveConflict("diff");
				return;
			}
			if (key.name === "escape") {
				take();
				if (dirty()) ask("leave", null);
				else stop();
			} else if (key.ctrl && key.name === "s") {
				take();
				void save();
			} else if (key.ctrl && key.name === "z") {
				take();
				step(history.undo());
			} else if (key.ctrl && key.name === "y") {
				take();
				step(history.redo());
			} else if (key.name === "pageup" || key.name === "pagedown") {
				take();
				surface.page(key.name === "pageup" ? -PAGE_LINES : PAGE_LINES);
			}
		},
		/** The surface changed by typing: one undo step. */
		changed() {
			history.record(surface.snapshot());
			deps.render();
		},
		conflict: (action: ConflictAction) => void resolveConflict(action),
		prompt: (action: PromptAction) => void answer(action),
		guard,
		/** The file changed on disk (claude, or anyone but this editor). */
		external(path: string, raw: string | null) {
			if (!session || session.path !== path || raw === null) return;
			if (raw === serializeDoc(session.disk, session.format)) return;
			const next = parseDoc(raw);
			if (!dirty()) {
				session.disk = next.text;
				session.format = next.format;
				load(next.text, surface.snapshot().cursor);
				return deps.render();
			}
			const rows = contextRows(diffLines(splitLines(session.disk), splitLines(next.text)));
			conflict = { raw, text: next.text, showingDiff: false, rows };
			deps.render();
		},
		/** Claude exited: resolves once no unsaved text is left (saved, discarded, or there was none). */
		confirmExit(): Promise<void> {
			if (!dirty()) return Promise.resolve();
			return new Promise((resolve) => {
				exitWaiter = resolve;
				if (session) deps.onStart(session.path);
				ask("exit", null);
			});
		},
	};
}
