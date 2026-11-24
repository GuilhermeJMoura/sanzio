import type { ViewerMode } from "$types/edit.ts";
import type { DiffOp, DiffRow } from "$types/observe.ts";
import type { DiffView, SplitView } from "$types/workspace.ts";
import { CLAUDE_MARK, theme } from "./theme.ts";

const d = theme;
const MODES: ViewerMode[] = ["diff", "marked", "split"];

/** `v` in the viewer: diff → arquivo marcado → lado a lado → diff. */
export function nextViewerMode(mode: ViewerMode): ViewerMode {
	return MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? "diff";
}

function emptyView(): DiffView {
	return {
		content: "",
		lineNumbers: new Map(),
		hideLineNumbers: new Set(),
		signs: new Map(),
		colors: new Map(),
		extraHighlights: [],
		firstJust: -1,
		targets: [],
	};
}

/** Lays diff rows out as one text with gutter maps; added lines in `justLines` (new-file numbers) get ◂ claude. */
export function diffView(
	rows: (DiffRow | null)[],
	justLines: number[],
	side: "both" | "old" | "new" = "both",
): DiffView {
	const just = new Set(justLines);
	const view = emptyView();
	const lines: string[] = [];
	let offset = 0;
	let previousJust = false;
	let nextNew = 1;
	rows.forEach((row, i) => {
		let text: string;
		if (row === null) {
			// the other side's line in the side-by-side layout
			text = "";
			view.hideLineNumbers.add(i);
			view.colors.set(i, { gutter: d.desk, content: d.desk });
			view.targets.push(nextNew);
			previousJust = false;
		} else if (row.kind === "gap") {
			text = `··· ${row.skipped} linhas iguais`;
			view.hideLineNumbers.add(i);
			view.extraHighlights.push([offset, offset + text.length, "phd.gap"]);
			view.targets.push(nextNew);
			previousJust = false;
		} else {
			text = row.text;
			const number = side === "old" || (side === "both" && row.kind === "del") ? row.oldNo : row.newNo;
			view.lineNumbers.set(i, number ?? 0);
			if (row.newNo !== null) nextNew = row.newNo + 1;
			view.targets.push(row.newNo ?? nextNew);
			const isJust = side !== "old" && row.kind === "add" && row.newNo !== null && just.has(row.newNo);
			if (row.kind === "add") {
				view.signs.set(i, { after: " +", afterColor: isJust ? d.accent : d.add });
				view.colors.set(i, { gutter: isJust ? d.glow : d.addBg, content: d.addBg });
			} else if (row.kind === "del") {
				view.signs.set(i, { after: " −", afterColor: d.del });
				view.colors.set(i, { gutter: d.delBg, content: d.delBg });
			}
			if (isJust && !previousJust) {
				if (view.firstJust < 0) view.firstJust = i;
				const at = offset + text.length + CLAUDE_MARK.indexOf("◂");
				text += CLAUDE_MARK;
				view.extraHighlights.push([at, offset + text.length, "phd.claude"]);
			}
			previousJust = isJust;
		}
		lines.push(text);
		offset += text.length + 1;
	});
	view.content = lines.join("\n");
	return view;
}

/** Old file on the left, new on the right, unchanged lines side by side and a blank where one side has no line. */
export function splitView(ops: DiffOp[], justLines: number[]): SplitView {
	const left: (DiffOp | null)[] = [];
	const right: (DiffOp | null)[] = [];
	const align = () => {
		while (left.length < right.length) left.push(null);
		while (right.length < left.length) right.push(null);
	};
	for (const op of ops) {
		if (op.kind === "eq") {
			align();
			left.push(op);
			right.push(op);
		} else if (op.kind === "del") {
			left.push(op);
		} else {
			right.push(op);
		}
	}
	align();
	const newSide = diffView(right, justLines, "new");
	return { left: diffView(left, [], "old"), right: newSide, firstJust: newSide.firstJust };
}
