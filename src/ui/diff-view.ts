import type { DiffRow } from "$types/observe.ts";
import type { DiffView } from "$types/workspace.ts";
import { CLAUDE_MARK, DRACULA } from "./theme.ts";

const d = DRACULA;

/** Lays diff rows out as one text with gutter maps; added lines in `justLines` (new-file numbers) get ◂ claude. */
export function diffView(rows: DiffRow[], justLines: number[]): DiffView {
	const just = new Set(justLines);
	const view: DiffView = {
		content: "",
		lineNumbers: new Map(),
		hideLineNumbers: new Set(),
		signs: new Map(),
		colors: new Map(),
		extraHighlights: [],
		firstJust: -1,
	};
	const lines: string[] = [];
	let offset = 0;
	let previousJust = false;
	rows.forEach((row, i) => {
		let text: string;
		if (row.kind === "gap") {
			text = `··· ${row.skipped} linhas iguais`;
			view.hideLineNumbers.add(i);
			view.extraHighlights.push([offset, offset + text.length, "phd.gap"]);
			previousJust = false;
		} else {
			text = row.text;
			view.lineNumbers.set(i, (row.kind === "del" ? row.oldNo : row.newNo) ?? 0);
			const isJust = row.kind === "add" && row.newNo !== null && just.has(row.newNo);
			if (row.kind === "add") {
				view.signs.set(i, { after: " +", afterColor: isJust ? d.accent : d.add });
				view.colors.set(i, { gutter: isJust ? d.accentBg : d.addBg, content: d.addBg });
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
