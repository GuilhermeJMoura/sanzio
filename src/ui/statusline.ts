import { BoxRenderable, type CliRenderer, TextRenderable } from "@opentui/core";
import type { Segment, StatusModel, StatusOptional, StatusParts } from "$types/workspace.ts";
import { themeWarning } from "../config.ts";
import { markSegments } from "./logo.ts";
import { styled, theme } from "./theme.ts";

const d = theme;

/** What the status line may leave out, in the order it gives way when the screen is too narrow. */
const DROPS: StatusOptional[] = [
	"longHint",
	"hint",
	"longWarning",
	"files",
	"editKeys",
	"follow",
	"editor",
	"counts",
	"activity",
	"branch",
];

const width = (segments: Segment[]) => segments.reduce((n, s) => n + [...s.text].length, 0);

/** Groups joined by a faint " · ". */
function joined(groups: Segment[][]): Segment[] {
	return groups.flatMap((group, i) => (i === 0 ? group : [{ text: " · ", fg: d.faint }, ...group]));
}

function rightParts(m: StatusModel, show: Set<StatusOptional>): Segment[] {
	const head: Segment[][] = [];
	if (m.editing && show.has("editKeys")) {
		head.push([
			{ text: "ctrl+s", fg: d.accent },
			{ text: " salvar · ", fg: d.faint },
			{ text: "esc", fg: d.accent },
			{ text: " sair", fg: d.faint },
		]);
	}
	if (show.has("counts")) {
		head.push([
			{ text: `+${m.added}`, fg: d.add },
			{ text: " ", fg: d.dim },
			{ text: `−${m.removed}`, fg: d.del },
			...(show.has("files") ? [{ text: ` · ${m.files} arq`, fg: d.dim }] : []),
		]);
	}
	const tail: Segment[][] = [];
	const hint = m.workspaceVisible
		? ""
		: m.manual === false
			? "editor escondido"
			: show.has("longHint")
				? "modo conversa · editor abre na 1ª edição"
				: "modo conversa";
	if (hint && show.has("hint")) tail.push([{ text: hint, fg: d.dim }]);
	if (show.has("editor"))
		tail.push([
			{ text: "ctrl+e", fg: d.accent },
			{ text: " editor", fg: d.faint },
		]);
	if (show.has("follow"))
		tail.push([
			{ text: "f", fg: d.accent },
			{ text: " seguir", fg: d.faint },
		]);
	const parts = [...joined(head), ...(head.length && tail.length ? [{ text: "  ", fg: d.dim }] : []), ...joined(tail)];
	return parts.length ? [...parts, { text: " ", fg: d.faint }] : [];
}

function leftParts(m: StatusModel, show: Set<StatusOptional>): Segment[] {
	const st = d.status;
	const left: Segment[] = [{ text: " " }, ...markSegments(), { text: " " }];
	if (m.invalidTheme !== null) {
		const text = themeWarning(m.invalidTheme, !show.has("longWarning"));
		left.push({ text, fg: st.warnFg, bg: st.warnBg, bold: true }, { text: " " });
	}
	if (m.editing) left.push({ text: m.dirty ? " EDITANDO ● " : " EDITANDO ", fg: d.bg, bg: d.mod, bold: true });
	left.push(
		m.follow === "following"
			? { text: " SEGUINDO ", fg: st.modeFg, bg: st.modeBg, bold: true }
			: { text: " PAUSADO ", fg: d.fg, bg: d.raised, bold: true },
	);
	if (m.branch && show.has("branch")) left.push({ text: ` ⎇ ${m.branch} `, fg: st.branchFg, bg: st.branchBg });
	if (!show.has("activity")) return left;
	if (m.busy && m.current) {
		left.push({ text: " claude em ", fg: d.dim }, { text: `${m.current} `, fg: d.fg });
	} else {
		left.push({ text: m.busy ? " claude pensando… " : " claude ocioso ", fg: d.dim });
	}
	return left;
}

/**
 * The status line's two sides, fitted to the screen: the conversation hint shortens, then goes, then the warning takes its
 * short form, then the right side's counts and keys, then the branch and activity. The Sanzio mark, the warning
 * and the modes are never cut.
 */
export function statusParts(m: StatusModel): StatusParts {
	const show = new Set<StatusOptional>(DROPS);
	for (const optional of DROPS) {
		if (width(leftParts(m, show)) + width(rightParts(m, show)) <= m.width) break;
		show.delete(optional);
	}
	return { left: leftParts(m, show), right: rightParts(m, show) };
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
		if (editor >= 0 && col >= editor && col < editor + "ctrl+e editor".length) handlers.onToggleWorkspace();
		else if (follow >= 0 && col >= follow && col < follow + "f seguir".length) handlers.onToggleFollow();
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
