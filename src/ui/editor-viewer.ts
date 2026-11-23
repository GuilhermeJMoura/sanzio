import type { CliRenderer, SimpleHighlight, SyntaxStyle } from "@opentui/core";
import { BoxRenderable, CodeRenderable, LineNumberRenderable, pathToFiletype } from "@opentui/core";
import type { ViewerMode } from "$types/edit.ts";
import type { DiffOp, DiffRow } from "$types/observe.ts";
import type { DiffView } from "$types/workspace.ts";
import { contextRows } from "../observe/diff.ts";
import { diffView, splitView } from "./diff-view.ts";
import { DRACULA } from "./theme.ts";

const d = DRACULA;
const JUST_TOP_MARGIN = 3;
const DOUBLE_CLICK_MS = 400;

function createCodePane(renderer: CliRenderer, id: string, style: SyntaxStyle, width: `${number}%`) {
	let extra: SimpleHighlight[] = [];
	let view: DiffView | null = null;
	const code = new CodeRenderable(renderer, {
		id: `${id}-code`,
		content: "",
		syntaxStyle: style,
		width: "100%",
		height: "100%",
		wrapMode: "none",
		// the viewer shows the raw source: highlight colors only, never hidden markup (# of a heading, fences)
		conceal: false,
		fg: d.fg,
		onHighlight: (highlights) => [...highlights, ...extra],
	});
	const gutter = new LineNumberRenderable(renderer, { id, target: code, fg: d.faint, width, height: "100%" });
	gutter.setGutterLayout({ minWidth: 0, paddingLeft: 1, paddingRight: 1, minDigits: 3, minAfterWidth: 2 });
	return {
		gutter,
		code,
		/** Shows `next`; true when the text changed. */
		show(next: DiffView, path: string): boolean {
			view = next;
			extra = next.extraHighlights;
			gutter.setLineNumbers(next.lineNumbers);
			gutter.setHideLineNumbers(next.hideLineNumbers);
			gutter.setLineSigns(next.signs);
			gutter.setLineColors(next.colors);
			const filetype = pathToFiletype(path) ?? "text";
			if (code.content === next.content && code.filetype === filetype) return false;
			code.filetype = filetype;
			code.content = next.content;
			return true;
		},
		/** File line under a screen row, for a double click. */
		lineAt(y: number): number | null {
			if (!view) return null;
			const row = code.scrollY + (y - code.y);
			return view.targets[row] ?? view.targets.at(-1) ?? null;
		},
	};
}

/** The read-only viewer: folded diff, whole file marked, or side by side; a double click asks to edit that line. */
export function createViewer(renderer: CliRenderer, style: SyntaxStyle, onEditAt: (line: number) => void) {
	const box = new BoxRenderable(renderer, { id: "editor-viewer", width: "100%", flexGrow: 1, flexDirection: "row" });
	const single = createCodePane(renderer, "editor-diff", style, "100%");
	const left = createCodePane(renderer, "editor-split-old", style, "50%");
	const right = createCodePane(renderer, "editor-split-new", style, "50%");
	for (const pane of [single, left, right]) box.add(pane.gutter);
	const panes = () => (single.gutter.visible ? [single] : [left, right]);

	let lastClick = { at: 0, y: -1 };
	for (const pane of [single, left, right]) {
		pane.code.onMouseDown = (event) => {
			const at = Date.now();
			if (at - lastClick.at < DOUBLE_CLICK_MS && lastClick.y === event.y) {
				const line = pane.lineAt(event.y);
				if (line !== null) onEditAt(line);
				lastClick = { at: 0, y: -1 };
				return;
			}
			lastClick = { at, y: event.y };
		};
	}

	let shown = { path: null as string | null, mode: "diff" as ViewerMode, justLines: [] as number[] };
	return {
		box,
		update(model: { path: string; rows: DiffRow[]; ops: DiffOp[]; justLines: number[]; mode: ViewerMode }) {
			const split = model.mode === "split";
			single.gutter.visible = !split;
			left.gutter.visible = split;
			right.gutter.visible = split;
			let changed: boolean;
			let firstJust: number;
			if (split) {
				const view = splitView(model.ops, model.justLines);
				changed = left.show(view.left, model.path);
				changed = right.show(view.right, model.path) || changed;
				firstJust = view.firstJust;
			} else {
				const rows = model.mode === "marked" ? model.ops : contextRows(model.ops);
				const view = diffView(model.mode === "diff" ? model.rows : rows, model.justLines);
				changed = single.show(view, model.path);
				firstJust = view.firstJust;
			}
			const reset = shown.path !== model.path || shown.mode !== model.mode;
			// each new edit (a new justLines list) jumps to what claude just wrote, even at the same row as the last one;
			// the user's scroll stays when only the age or the gutter changed
			const newEdit = model.justLines.length > 0 && model.justLines !== shown.justLines;
			if ((changed || reset) && firstJust >= 0 && (newEdit || reset)) {
				for (const pane of panes()) pane.code.scrollY = Math.max(0, firstJust - JUST_TOP_MARGIN);
			} else if (reset) {
				for (const pane of panes()) pane.code.scrollY = 0;
			}
			if (changed || reset) shown = { path: model.path, mode: model.mode, justLines: model.justLines };
		},
		/** Shows plain diff rows (claude's change while I keep my text), not tied to the open file's state. */
		showRows(path: string, rows: DiffRow[]) {
			single.gutter.visible = true;
			left.gutter.visible = false;
			right.gutter.visible = false;
			single.show(diffView(rows, []), path);
			shown = { path: null, mode: "diff", justLines: [] };
		},
		scroll(lines: number) {
			for (const pane of panes()) {
				pane.code.scrollY = Math.max(0, Math.min(pane.code.maxScrollY, pane.code.scrollY + lines));
			}
		},
		/** File line at the top of the view, where `i` puts the cursor. */
		topLine(): number {
			const pane = panes().at(-1);
			return pane?.lineAt(pane.code.y) ?? 1;
		},
	};
}
