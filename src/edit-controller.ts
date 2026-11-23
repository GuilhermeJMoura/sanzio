import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KeyEvent } from "@opentui/core";
import type { ConflictAction, EditModel, EditSurface, ParsedDoc, PromptAction, PromptReason } from "$types/edit.ts";
import type { DiffRow } from "$types/observe.ts";
import { contextRows, diffLines, splitLines } from "./observe/diff.ts";
import type { SessionChanges } from "./observe/session-changes.ts";
import { decodeStrict, MAX_EDIT_BYTES, readEditable } from "./observe/watcher.ts";
import { EditHistory, parseDoc, serializeDoc } from "./ui/edit-buffer.ts";

const PAGE_LINES = 10;

/**
 * Edit mode of the editor pane: the file as it is on disk, my changes, undo/redo, ctrl+s, and what happens when
 * claude writes the same file or I try to leave with unsaved text.
 */
export function createEditController(deps: {
	root: string;
	surface: EditSurface;
	changes: SessionChanges;
	now: () => number;
	render: () => void;
	/** edit mode started or needs the user: pause follow, show and focus the editor on `path` */
	onStart: (path: string) => void;
}) {
	const { surface } = deps;
	// `doc` is the file as last read or saved, `raw` its exact text: the disk is compared against `raw`, never re-encoded
	let session: { path: string; doc: ParsedDoc; raw: string } | null = null;
	let history = new EditHistory({ text: "", cursor: 0 });
	// `raw` is null when claude's bytes are not valid UTF-8: they can be shown, not loaded
	let conflict: { raw: string | null; text: string; showingDiff: boolean; rows: DiffRow[] } | null = null;
	let prompt: PromptReason | null = null;
	let afterPrompt: (() => void) | null = null;
	let exitWaiter: (() => void) | null = null;
	let readOnly: string | null = null;
	let saveError: string | null = null;

	const dirty = () => session !== null && surface.snapshot().text !== session.doc.text;

	const stop = () => {
		session = null;
		conflict = null;
		saveError = null;
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

	const markConflict = (bytes: Buffer) => {
		if (!session) return;
		const raw = decodeStrict(bytes);
		const text = parseDoc(raw ?? bytes.toString("utf8")).text;
		const rows = contextRows(diffLines(splitLines(session.doc.text), splitLines(text)));
		conflict = { raw, text, showingDiff: false, rows };
	};

	/** What is on disk now, when it is no longer what this session opened or last saved; null when unchanged. */
	const changedOnDisk = async (file: string, expected: string): Promise<Buffer | null> => {
		try {
			const bytes = await readFile(file);
			return bytes.equals(Buffer.from(expected)) ? null : bytes;
		} catch {
			// gone: writing recreates it, and a folder that is gone fails the write below
			return null;
		}
	};

	/**
	 * Writes my text; false when it did not: the file changed on disk since I opened it (the conflict notice shows,
	 * unless `overwrite`), or the write failed (the error shows). Never throws; my text stays in the editor.
	 */
	const save = async (overwrite = false): Promise<boolean> => {
		if (!session) return false;
		const current = session;
		const { path } = current;
		const file = join(deps.root, path);
		const text = surface.snapshot().text;
		const raw = serializeDoc(text, current.doc);
		if (!overwrite) {
			const theirs = await changedOnDisk(file, current.raw);
			if (theirs !== null) {
				markConflict(theirs);
				deps.render();
				return false;
			}
		}
		try {
			await writeFile(file, raw);
		} catch (error) {
			const code = error instanceof Error && "code" in error ? String(error.code) : String(error);
			saveError = `não foi possível salvar: ${code}`;
			deps.render();
			return false;
		}
		saveError = null;
		current.raw = raw;
		current.doc = parseDoc(raw);
		conflict = null;
		deps.changes.apply({ path, content: raw, byClaude: false, byYou: true, tool: "phdterm", at: deps.now() });
		// claude already left: once nothing is unsaved, phdterm can close
		if (exitWaiter) stop();
		else deps.render();
		return true;
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
		// a save that did not happen keeps the prompt (and phdterm) open on my text
		if (action === "save" && !(await save())) return;
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
		if (action === "keep") return void (await save(true));
		const { raw } = conflict;
		conflict = null;
		if (raw === null) {
			// not valid UTF-8: loading it would save replacement characters later
			readOnly = session.path;
			return stop();
		}
		session.raw = raw;
		session.doc = parseDoc(raw);
		load(session.doc.text, surface.snapshot().cursor);
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
		const raw = await readEditable(join(deps.root, path));
		if (raw === null) {
			readOnly = path;
			return deps.render();
		}
		session = { path, doc: parseDoc(raw), raw };
		surface.load(session.doc.text, line);
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
				error: active ? saveError : null,
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
		save: () => save(),
		conflict: (action: ConflictAction) => resolveConflict(action),
		prompt: (action: PromptAction) => answer(action),
		guard,
		/** The file changed on disk (claude, or anyone but this editor); `content` is null when it is gone. */
		async external(path: string, content: string | null) {
			if (!session || session.path !== path || content === null) return;
			const current = session;
			let bytes: Buffer;
			try {
				bytes = await readFile(join(deps.root, path));
			} catch {
				return;
			}
			if (session !== current || bytes.equals(Buffer.from(current.raw))) return;
			const raw = bytes.length > MAX_EDIT_BYTES || bytes.includes(0) ? null : decodeStrict(bytes);
			if (!dirty()) {
				if (raw === null) {
					// no longer editable text (invalid UTF-8, binary or too big): só leitura
					readOnly = path;
					return stop();
				}
				current.raw = raw;
				current.doc = parseDoc(raw);
				load(current.doc.text, surface.snapshot().cursor);
				return deps.render();
			}
			markConflict(bytes);
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
