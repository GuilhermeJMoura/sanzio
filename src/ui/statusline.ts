import { BoxRenderable, type CliRenderer, TextRenderable } from "@opentui/core";
import type { Segment, StatusModel, StatusParts } from "$types/workspace.ts";
import { DRACULA, styled } from "./theme.ts";

const d = DRACULA;

export function statusParts(m: StatusModel): StatusParts {
	const left: Segment[] = [
		m.follow === "following"
			? { text: " SEGUINDO ", fg: d.bg, bg: d.accent, bold: true }
			: { text: " PAUSADO ", fg: d.fg, bg: d.line2, bold: true },
	];
	if (m.branch) left.push({ text: ` ⎇ ${m.branch} `, fg: d.fg, bg: d.line2 });
	if (m.busy && m.current) {
		left.push({ text: " claude em ", fg: d.dim }, { text: `${m.current} `, fg: d.fg });
	} else {
		left.push({ text: m.busy ? " claude pensando… " : " claude ocioso ", fg: d.dim });
	}

	const hint = m.workspaceVisible
		? ""
		: m.manual === false
			? "editor escondido · "
			: "modo conversa · editor abre na 1ª edição · ";
	const right: Segment[] = [
		{ text: `+${m.added}`, fg: d.add },
		{ text: " ", fg: d.dim },
		{ text: `−${m.removed}`, fg: d.del },
		{ text: ` · ${m.files} arq  ${hint}`, fg: d.dim },
		{ text: "ctrl+e", fg: d.accent },
		{ text: " editor · ", fg: d.faint },
		{ text: "f", fg: d.accent },
		{ text: " seguir ", fg: d.faint },
	];
	return { left, right };
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
