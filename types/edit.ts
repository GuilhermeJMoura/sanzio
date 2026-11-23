import type { DiffRow } from "./observe.ts";

/** How the viewer lays a file out: the folded diff, the whole file with +/− marked, or old and new side by side. */
export type ViewerMode = "diff" | "marked" | "split";

export type Eol = "\n" | "\r\n";

/** What saving must give back exactly as the file had it on disk. */
export interface DocFormat {
	eol: Eol;
	finalNewline: boolean;
}

/** One undo step: the text in the editor (LF line breaks) and where the cursor was. */
export interface EditSnapshot {
	text: string;
	/** cursor offset in document display cells, one per newline */
	cursor: number;
}

/** What edit mode needs from the text surface on screen. */
export interface EditSurface {
	/** loads `text` with the cursor at the start of the 1-based `line` */
	load(text: string, line: number): void;
	set(snapshot: EditSnapshot): void;
	snapshot(): EditSnapshot;
	/** moves the cursor `lines` rows down (negative: up) */
	page(lines: number): void;
}

/** Why phdterm asks salvar / descartar / cancelar before it drops unsaved text. */
export type PromptReason = "switch" | "follow" | "leave" | "exit";

export type PromptAction = "save" | "discard" | "cancel";

export type ConflictAction = "reload" | "keep" | "diff";

/** The part of the editor that edit mode drives. */
export interface EditModel {
	active: boolean;
	dirty: boolean;
	/** "o claude mudou este arquivo": set while my unsaved text and claude's write disagree */
	conflict: { showingDiff: boolean; rows: DiffRow[] } | null;
	prompt: PromptReason | null;
	/** the open file cannot be edited (binary or over 1 MB) */
	readOnly: boolean;
}
