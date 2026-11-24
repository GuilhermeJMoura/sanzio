import { BoxRenderable, type CliRenderer, TextRenderable } from "@opentui/core";
import type { Segment, StatusModel, StatusParts } from "$types/workspace.ts";
import { themeWarning } from "../config.ts";
import { markSegments } from "./logo.ts";
import { styled, theme } from "./theme.ts";

const d = theme;
// below this width the theme warning takes its short form
const NARROW_COLS = 80;

const width = (segments: Segment[]) => segments.reduce((n, s) => n + [...s.text].length, 0);

function rightParts(m: StatusModel, hint: string): Segment[] {
	const editKeys: Segment[] = m.editing
		? [
				{ text: "ctrl+s", fg: d.accent },
				{ text: " salvar · ", fg: d.faint },
				{ text: "esc", fg: d.accent },
				{ text: " sair · ", fg: d.faint },
			]
		: [];
	return [
		...editKeys,
		{ text: `+${m.added}`, fg: d.add },
		{ text: " ", fg: d.dim },
		{ text: `−${m.removed}`, fg: d.del },
		{ text: ` · ${m.files} arq  ${hint}`, fg: d.dim },
		{ text: "ctrl+e", fg: d.accent },
		{ text: " editor · ", fg: d.faint },
		{ text: "f", fg: d.accent },
		{ text: " seguir ", fg: d.faint },
	];
}

export function statusParts(m: StatusModel): StatusParts {
	const st = d.status;
	const mark: Segment[] = [{ text: " " }, ...markSegments(), { text: " " }];
	const left: Segment[] = [...mark];
	let hint = m.workspaceVisible
		? ""
		: m.manual === false
			? "editor escondido · "
			: "modo conversa · editor abre na 1ª edição · ";
	if (m.invalidTheme !== null) {
		// the warning is never cut: the conversation hint gives way first, then the long form
		let text = themeWarning(m.invalidTheme, m.width < NARROW_COLS);
		const room = (warning: string) => width(mark) + warning.length + 1 + width(rightParts(m, hint)) <= m.width;
		if (!room(text)) hint = "";
		if (!room(text)) text = themeWarning(m.invalidTheme, true);
		left.push({ text, fg: st.warnFg, bg: st.warnBg, bold: true }, { text: " " });
	}
	if (m.editing) left.push({ text: m.dirty ? " EDITANDO ● " : " EDITANDO ", fg: d.bg, bg: d.mod, bold: true });
	left.push(
		m.follow === "following"
			? { text: " SEGUINDO ", fg: st.modeFg, bg: st.modeBg, bold: true }
			: { text: " PAUSADO ", fg: d.fg, bg: d.raised, bold: true },
	);
	if (m.branch) left.push({ text: ` ⎇ ${m.branch} `, fg: st.branchFg, bg: st.branchBg });
	if (m.busy && m.current) {
		left.push({ text: " claude em ", fg: d.dim }, { text: `${m.current} `, fg: d.fg });
	} else {
		left.push({ text: m.busy ? " claude pensando… " : " claude ocioso ", fg: d.dim });
	}
	return { left, right: rightParts(m, hint) };
}

/** The status line; its "ctrl+e editor" and "f seguir" hints are clickable, the way back when only claude has focus. */
export function createStatusLine(
	renderer: CliRenderer,
	handlers: { onToggleWorkspace: () => void; onToggleFollow: () => void },
) {
	const box = new BoxRenderable(renderer, {
		id: "status-line",
		width: "100%",
		height: 1,
		flexDirection: "row",
		flexShrink: 0,
		backgroundColor: d.bar,
	});
	const left = new TextRenderable(renderer, { id: "status-left", flexGrow: 1, flexShrink: 1, wrapMode: "none" });
	const right = new TextRenderable(renderer, { id: "status-right", flexShrink: 0, wrapMode: "none" });
	box.add(left);
	box.add(right);
	let rightText = "";
	right.onMouseDown = (event) => {
		const col = event.x - right.x;
		const editor = rightText.indexOf("ctrl+e editor");
		const follow = rightText.indexOf("f seguir");
		if (col >= editor && col < editor + "ctrl+e editor".length) handlers.onToggleWorkspace();
		else if (col >= follow && col < follow + "f seguir".length) handlers.onToggleFollow();
	};
	return {
		box,
		update(model: StatusModel) {
			const parts = statusParts(model);
			rightText = parts.right.map((s) => s.text).join("");
			left.content = styled(parts.left);
			right.content = styled(parts.right);
		},
	};
}
