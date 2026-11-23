import type { PaneId, PaneSizes, WorkspaceState } from "$types/workspace.ts";

const MAX_TABS = 4;

export function initialWorkspace(): WorkspaceState {
	return { focus: "claude", follow: "following", manual: null, hasEdits: false, open: null, tabs: [], pending: null };
}

/** Explorer and editor show after claude's first edit, unless ctrl+e said otherwise. */
export function workspaceVisible(s: WorkspaceState): boolean {
	return s.manual ?? s.hasEdits;
}

/** Explorer about a fifth of the width, claude 38% of the rows above the status line. */
export function paneSizes(width: number, height: number): PaneSizes {
	return {
		explorerWidth: Math.min(40, Math.max(24, Math.round(width * 0.22))),
		claudeHeight: Math.max(3, Math.round((height - 1) * 0.38)),
	};
}

function open(s: WorkspaceState, path: string): WorkspaceState {
	const tabs = [...s.tabs.filter((t) => t !== path), path].slice(-MAX_TABS);
	return { ...s, open: path, tabs, pending: s.pending === path ? null : s.pending };
}

export function claudeEdited(s: WorkspaceState, path: string): WorkspaceState {
	const next = { ...s, hasEdits: true };
	if (s.follow === "following") return { ...open(next, path), pending: null };
	return { ...next, pending: s.open === path ? null : path };
}

/** The user picked a file: anything other than claude's last edit pauses follow. */
export function openByUser(s: WorkspaceState, path: string, lastEdit: string | null): WorkspaceState {
	const next = open(s, path);
	return path === lastEdit ? next : { ...next, follow: "paused" };
}

export function toggleFollow(s: WorkspaceState, lastEdit: string | null): WorkspaceState {
	if (s.follow === "following") return { ...s, follow: "paused" };
	const next: WorkspaceState = { ...s, follow: "following", pending: null };
	return lastEdit ? open(next, lastEdit) : next;
}

export function dismissPending(s: WorkspaceState): WorkspaceState {
	return { ...s, pending: null };
}

export function toggleWorkspace(s: WorkspaceState): WorkspaceState {
	const manual = !workspaceVisible(s);
	return { ...s, manual, focus: manual ? s.focus : "claude" };
}

export function focusPane(s: WorkspaceState, pane: PaneId): WorkspaceState {
	if (pane !== "claude" && !workspaceVisible(s)) return s;
	return { ...s, focus: pane };
}
