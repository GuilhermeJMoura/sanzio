import type { KeyEvent } from "@opentui/core";
import type { DiffRow } from "./observe.ts";

export type PaneId = "explorer" | "editor" | "claude";

export type FollowMode = "following" | "paused";

export interface WorkspaceState {
	focus: PaneId;
	follow: FollowMode;
	/** ctrl+e choice: true shows explorer and editor, false hides them; null lets the first edit decide */
	manual: boolean | null;
	hasEdits: boolean;
	open: string | null;
	tabs: string[];
	/** file claude edited while follow was paused, offered in the "o claude editou X" notice */
	pending: string | null;
}

export interface PaneSizes {
	explorerWidth: number;
	claudeHeight: number;
}

export interface StatusModel {
	follow: FollowMode;
	branch: string | null;
	busy: boolean;
	/** file claude is on right now, if any */
	current: string | null;
	added: number;
	removed: number;
	files: number;
	workspaceVisible: boolean;
	manual: boolean | null;
}

/** A run of styled text in a terminal cell row. */
export interface Segment {
	text: string;
	fg?: string;
	bg?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
}

export type TreeRow =
	| { kind: "dir"; path: string; name: string; depth: number; expanded: boolean; dirty: boolean }
	| { kind: "file"; path: string; name: string; depth: number; mark: "M" | "U" | null; live: boolean };

export interface TreeNode {
	dirs: Map<string, TreeNode>;
	files: string[];
}

export interface ChangedRow {
	path: string;
	name: string;
	dir: string;
	isNew: boolean;
	added: number;
	removed: number;
	age: string;
}

export interface ExplorerModel {
	rootName: string;
	changed: ChangedRow[];
	tree: TreeRow[];
	open: string | null;
	/** keyboard cursor, an index into the explorer items (changed rows, then tree rows) */
	cursor: number;
	focused: boolean;
}

/** What a selectable explorer line does: open a file or fold/unfold a folder. */
export type ExplorerItem = { kind: "file"; path: string } | { kind: "dir"; path: string };

export interface ExplorerLine {
	segments: Segment[];
	item: number | null;
}

export interface EditorModel {
	path: string | null;
	rows: DiffRow[];
	justLines: number[];
	follow: FollowMode;
	tabs: string[];
	claudeTouched: string[];
	pending: string | null;
	focused: boolean;
}

export interface StatusParts {
	left: Segment[];
	right: Segment[];
}

/** The diff rows laid out for a Code renderable with a line-number gutter. */
export interface DiffView {
	content: string;
	lineNumbers: Map<number, number>;
	hideLineNumbers: Set<number>;
	signs: Map<number, { after: string; afterColor: string }>;
	colors: Map<number, { gutter: string; content: string }>;
	/** [start, end, group] character ranges the syntax highlight must also paint */
	extraHighlights: [number, number, string][];
	/** row of the first line claude just wrote, or -1 */
	firstJust: number;
}

export interface WorkspaceViewModel {
	visible: boolean;
	sizes: PaneSizes;
	focus: PaneId;
	explorer: ExplorerModel;
	editor: EditorModel;
	status: StatusModel;
}

export interface WorkspaceHandlers {
	onFocus: (pane: PaneId) => void;
	onExplorerItem: (index: number) => void;
	onOpenPending: () => void;
	onDismiss: () => void;
	onTab: (path: string) => void;
	onKey: (pane: PaneId, key: KeyEvent) => void;
	onToggleWorkspace: () => void;
	onToggleFollow: () => void;
}
