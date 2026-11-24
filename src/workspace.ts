import { realpathSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import type { BoxRenderable, CliRenderer, EmbeddedTerminalRenderable, KeyEvent } from "@opentui/core";
import type { GitMark, HookEvent, RepoInfo } from "$types/observe.ts";
import type { SessionState } from "$types/session.ts";
import type { ExplorerItem, PaneId, WorkspaceState, WorkspaceViewModel } from "$types/workspace.ts";
import { createEditController } from "./edit-controller.ts";
import { addedLines } from "./observe/diff.ts";
import { SessionChanges } from "./observe/session-changes.ts";
import { ToolCalls } from "./observe/tool-calls.ts";
import { gitBranch, gitMarks, listFiles, readSnapshot, readText, watchTree } from "./observe/watcher.ts";
import { nextViewerMode } from "./ui/diff-view.ts";
import { explorerItems } from "./ui/explorer.ts";
import { ancestors, changedRows, treeRows } from "./ui/explorer-rows.ts";
import {
	claudeEdited,
	dismissPending,
	focusPane,
	initialWorkspace,
	openByUser,
	paneSizes,
	startEditing,
	toggleFollow,
	toggleWorkspace,
	workspaceVisible,
} from "./ui/layout.ts";
import { createWorkspaceView } from "./ui/workspace-view.ts";

// a watcher event this long after claude's last tool call still counts as claude's (FSEvents lag)
const TOOL_GRACE_MS = 1500;
const TICK_MS = 1000;

/** Follows claude's edits: hook events and file changes in, explorer / editor / status line out. */
export function createWorkspace(
	renderer: CliRenderer,
	repo: RepoInfo,
	claude: { box: BoxRenderable; terminal: EmbeddedTerminalRenderable },
	now: () => number = Date.now,
) {
	const changes = new SessionChanges();
	const expanded = new Set<string>();
	const toolOnFile = new Map<string, string>();
	const branch = repo.isGit ? gitBranch(repo.root) : null;
	let state: WorkspaceState = initialWorkspace();
	let files: string[] = [];
	let marks = new Map<string, GitMark>();
	let cursor = 0;
	let sessionState: SessionState | null = null;
	const calls = new ToolCalls();
	let graceUntil = 0;
	let stopWatch: () => void = () => {};
	let items: ExplorerItem[] = [];

	const claudeActive = () => calls.active(now()) || now() < graceUntil || sessionState === "working";
	const lastEditPath = () => changes.lastEdit?.path ?? null;

	const toRelative = (file: string | null): string | null => {
		if (!file) return null;
		for (const candidate of [file, () => realpathSync(file)]) {
			try {
				const abs = typeof candidate === "string" ? candidate : candidate();
				const rel = relative(repo.root, abs);
				if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split("\\").join("/");
			} catch {
				// a path that does not exist yet cannot be resolved: try the next spelling
			}
		}
		return null;
	};

	const viewModel = (): WorkspaceViewModel => {
		const busy = claudeActive();
		const current = busy ? (calls.current() ?? lastEditPath()) : null;
		const edits = changes.claudeEdits();
		const explorer = {
			rootName: basename(repo.root),
			changed: changedRows(edits, now()),
			mine: changedRows(changes.yourEdits(), now()),
			tree: treeRows({
				files,
				expanded,
				marks,
				claude: new Set(edits.map((e) => e.path)),
				live: current,
			}),
			open: state.open,
			cursor,
			focused: state.focus === "explorer",
		};
		items = explorerItems(explorer);
		const last = changes.lastEdit;
		const totals = changes.totals();
		const edit = editing.model(state.open);
		return {
			visible: workspaceVisible(state),
			sizes: paneSizes(renderer.width, renderer.height),
			focus: state.focus,
			explorer,
			editor: {
				path: state.open,
				rows: state.open ? changes.viewerRows(state.open) : [],
				ops: state.open ? changes.viewerOps(state.open) : [],
				justLines: last && last.path === state.open ? last.justLines : [],
				viewer: state.viewer,
				edit,
				follow: state.follow,
				tabs: state.tabs,
				claudeTouched: edits.map((e) => e.path),
				pending: state.pending,
				focused: state.focus === "editor",
			},
			status: {
				follow: state.follow,
				branch,
				busy,
				current,
				added: totals.added,
				removed: totals.removed,
				files: totals.files,
				workspaceVisible: workspaceVisible(state),
				manual: state.manual,
				editing: edit.active,
				dirty: edit.dirty,
			},
		};
	};

	const render = () => {
		view.render(viewModel());
		renderer.requestRender();
	};
	const set = (next: WorkspaceState) => {
		state = next;
		render();
	};

	const ensureBase = async (path: string) => {
		if (!changes.hasBase(path)) changes.setBase(path, await readText(join(repo.root, path)));
	};

	const refreshMarks = async () => {
		if (!repo.isGit) return;
		marks = await gitMarks(repo.root);
		render();
	};

	const applyFile = async (path: string, byClaude: boolean, tool: string, justLines?: number[]) => {
		const content = await readText(join(repo.root, path));
		await editing.external(path, content);
		if (!changes.apply({ path, content, byClaude, tool, justLines, at: now() })) return;
		if (content === null) files = files.filter((f) => f !== path);
		else if (!files.includes(path)) files = [...files, path];
		if (!byClaude) return;
		for (const dir of ancestors(path)) expanded.add(dir);
		// never follow away from the file being edited
		if (editing.active()) state = { ...state, follow: "paused" };
		state = claudeEdited(state, path);
	};

	const openPath = async (path: string) => {
		await ensureBase(path);
		// leaving the file I edit with unsaved text asks first
		const open = () => set(openByUser(state, path, lastEditPath()));
		if (path === state.open) open();
		else editing.guard(open);
	};

	const onToggleFollow = () => {
		const toggle = () => set(toggleFollow(state, lastEditPath()));
		// following moves the editor on claude's next edit: edit mode ends first, unsaved text asks
		if (state.follow === "paused" && editing.active()) editing.guard(toggle, "follow");
		else toggle();
	};

	const activate = (index: number) => {
		const item = items[index];
		if (!item) return;
		cursor = index;
		if (item.kind === "file") return void openPath(item.path);
		if (expanded.has(item.path)) expanded.delete(item.path);
		else expanded.add(item.path);
		render();
	};

	const onKey = (pane: PaneId, key: KeyEvent) => {
		const plain = !key.ctrl && !key.meta;
		if (key.name === "f" && plain) return onToggleFollow();
		if (pane === "explorer") {
			if (key.name === "up" || key.name === "down") {
				cursor = Math.max(0, Math.min(items.length - 1, cursor + (key.name === "up" ? -1 : 1)));
				render();
			} else if (key.name === "return" || key.name === "enter" || key.name === "space") {
				activate(cursor);
			}
		} else if (pane === "editor") {
			const step = { up: -1, down: 1, pageup: -10, pagedown: 10 }[key.name];
			if (step) view.scrollEditor(step);
			else if (key.name === "i" && plain && state.open) void editing.enter(state.open, view.editorTopLine());
			else if (key.name === "v" && plain && state.open) set({ ...state, viewer: nextViewerMode(state.viewer) });
		}
	};

	const view = createWorkspaceView(renderer, claude, {
		onFocus: (pane) => {
			if (state.focus !== pane) set(focusPane(state, pane));
		},
		onExplorerItem: activate,
		onOpenPending: () => {
			if (state.pending) void openPath(state.pending);
		},
		onDismiss: () => set(dismissPending(state)),
		onTab: (path) => void openPath(path),
		onKey,
		onToggleWorkspace: () => set(toggleWorkspace(state)),
		onToggleFollow,
		onEditAt: (line) => {
			if (state.open) void editing.enter(state.open, line);
		},
		onEditKey: (key) => editing.key(key),
		onEditChange: () => editing.changed(),
		onConflict: (action) => editing.conflict(action),
		onPrompt: (action) => editing.prompt(action),
	});
	const editing = createEditController({
		root: repo.root,
		surface: view.editSurface,
		changes,
		now,
		render,
		onStart: (path) => {
			state = startEditing(state, path);
		},
	});

	const filesChanged = async (paths: string[], forceClaude = false) => {
		const byClaude = forceClaude || claudeActive();
		for (const path of paths) await applyFile(path, byClaude, toolOnFile.get(path) ?? "Bash");
		render();
		void refreshMarks();
	};

	const timer = setInterval(render, TICK_MS);
	renderer.on("resize", render);
	// ctrl+e is sanzio's in every pane, claude's included (End still moves to the end of the line there);
	// global key listeners run before the focused pane, so claude never sees it
	const onGlobalKey = (key: KeyEvent) => {
		if (!key.ctrl || key.meta || key.name !== "e") return;
		key.preventDefault();
		set(toggleWorkspace(state));
	};
	renderer.keyInput.on("keypress", onGlobalKey);
	render();

	return {
		root: view.root,
		/** Lists the tree and reads the session-start snapshot, then starts watching. */
		async start() {
			files = await listFiles(repo);
			for (const [path, content] of await readSnapshot(repo.root, files)) changes.setBase(path, content);
			stopWatch = watchTree({
				...repo,
				onChange: (paths) => void filesChanged(paths),
			});
			await refreshMarks();
		},
		async hook(event: HookEvent) {
			const path = toRelative(event.file);
			const callId = event.toolUseId ?? `${event.tool}:${event.file ?? ""}`;
			if (event.phase === "pre") {
				calls.start(callId, path, now());
				if (path) {
					toolOnFile.set(path, event.tool);
					await ensureBase(path);
				}
				return render();
			}
			calls.end(callId);
			graceUntil = now() + TOOL_GRACE_MS;
			if (path && event.tool !== "Bash") {
				await applyFile(path, true, event.tool, event.patch ? addedLines(event.patch) : undefined);
				toolOnFile.delete(path);
			}
			const bashFiles = event.changedFiles.map(toRelative).filter((p): p is string => p !== null);
			await filesChanged(bashFiles, true);
		},
		setSessionState(next: SessionState | null) {
			sessionState = next;
			// idle after an interrupt or a denied permission: the calls that never got their Post are over
			if (next === "idle") calls.clear();
			render();
		},
		/** Claude exited: resolves once the editor holds no unsaved text (asks salvar / descartar / cancelar). */
		confirmExit: () => editing.confirmExit(),
		stop() {
			clearInterval(timer);
			renderer.keyInput.off("keypress", onGlobalKey);
			stopWatch();
		},
	};
}
