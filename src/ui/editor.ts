import type { CliRenderer, SimpleHighlight } from "@opentui/core";
import { BoxRenderable, CodeRenderable, LineNumberRenderable, pathToFiletype, TextRenderable } from "@opentui/core";
import type { EditorModel, Segment } from "$types/workspace.ts";
import { diffView } from "./diff-view.ts";
import { createSyntaxStyle, DRACULA, fileIcon, styled } from "./theme.ts";

const d = DRACULA;
const JUST_TOP_MARGIN = 3;

function followLabel(model: EditorModel): Segment[] {
	return model.follow === "following"
		? [{ text: " ● seguindo o claude ", fg: d.accent, bg: d.bg }]
		: [{ text: " ◌ seguir pausado · f ", fg: d.dim, bg: d.bg }];
}

/** Tab strip segments, and the column range of each tab for clicks. */
function tabs(model: EditorModel): { segments: Segment[]; ranges: [number, number, string][] } {
	const segments: Segment[] = [];
	const ranges: [number, number, string][] = [];
	let col = 0;
	model.tabs.forEach((path, i) => {
		const icon = fileIcon(path);
		const on = path === model.path;
		const parts: Segment[] = [
			{ text: i === 0 ? " " : "  " },
			{ text: `${icon.glyph} `, fg: icon.color },
			{ text: path.slice(path.lastIndexOf("/") + 1), fg: on ? d.strong : d.dim, underline: on },
		];
		if (model.claudeTouched.includes(path)) parts.push({ text: " ●", fg: d.mod });
		const width = parts.reduce((n, p) => n + p.text.length, 0);
		ranges.push([col, col + width, path]);
		col += width;
		segments.push(...parts);
	});
	return { segments, ranges };
}

export function createEditor(
	renderer: CliRenderer,
	handlers: { onFocus: () => void; onOpenPending: () => void; onDismiss: () => void; onTab: (path: string) => void },
) {
	const box = new BoxRenderable(renderer, {
		id: "editor",
		width: "100%",
		flexGrow: 1,
		borderStyle: "rounded",
		borderColor: d.line2,
		focusedBorderColor: d.accent,
		backgroundColor: d.bg,
		title: " editor ",
		titleColor: d.strong,
		focusable: true,
	});
	const follow = new TextRenderable(renderer, { id: "editor-follow", position: "absolute", top: -1, right: 1 });
	const tabRow = new TextRenderable(renderer, { id: "editor-tabs", width: "100%", height: 1, wrapMode: "none" });
	const banner = new BoxRenderable(renderer, {
		id: "editor-banner",
		width: "100%",
		height: 1,
		flexDirection: "row",
		backgroundColor: d.accentBg,
		visible: false,
	});
	const bannerText = new TextRenderable(renderer, { flexGrow: 1, flexShrink: 1, wrapMode: "none" });
	const openButton = new TextRenderable(renderer, {
		content: styled([{ text: " abrir ", fg: d.bg, bg: d.accent, bold: true }]),
	});
	const ignoreButton = new TextRenderable(renderer, {
		content: styled([{ text: " " }, { text: " ignorar ", fg: d.dim, bg: d.line2 }, { text: " " }]),
	});
	openButton.onMouseDown = (event) => {
		event.stopPropagation();
		handlers.onOpenPending();
	};
	ignoreButton.onMouseDown = (event) => {
		event.stopPropagation();
		handlers.onDismiss();
	};
	banner.add(bannerText);
	banner.add(openButton);
	banner.add(ignoreButton);

	const empty = new TextRenderable(renderer, {
		id: "editor-empty",
		width: "100%",
		flexGrow: 1,
		content: styled([
			{ text: "\n  esperando o claude editar algo…\n", fg: d.dim },
			{ text: "  ou escolha um arquivo no explorer", fg: d.faint },
		]),
	});
	let extra: SimpleHighlight[] = [];
	const code = new CodeRenderable(renderer, {
		id: "editor-code",
		content: "",
		syntaxStyle: createSyntaxStyle(renderer),
		width: "100%",
		height: "100%",
		wrapMode: "none",
		// the viewer shows the raw source: highlight colors only, never hidden markup (# of a heading, fences)
		conceal: false,
		fg: d.fg,
		onHighlight: (highlights) => [...highlights, ...extra],
	});
	const gutter = new LineNumberRenderable(renderer, {
		id: "editor-diff",
		target: code,
		fg: d.faint,
		width: "100%",
		flexGrow: 1,
		visible: false,
	});
	gutter.setGutterLayout({ minWidth: 0, paddingLeft: 1, paddingRight: 1, minDigits: 3, minAfterWidth: 2 });

	for (const child of [follow, tabRow, banner, empty, gutter]) box.add(child);
	box.onMouseDown = () => handlers.onFocus();
	let tabRanges: [number, number, string][] = [];
	tabRow.onMouseDown = (event) => {
		const col = event.x - tabRow.x;
		const hit = tabRanges.find(([start, end]) => col >= start && col < end);
		if (hit) handlers.onTab(hit[2]);
	};

	let shown = { path: null as string | null, content: "", justLines: [] as number[] };
	return {
		box,
		update(model: EditorModel) {
			box.title = ` ${model.path ?? "editor"} `;
			box.titleColor = model.focused ? d.accent : d.strong;
			follow.content = styled(followLabel(model));
			const strip = tabs(model);
			tabRanges = strip.ranges;
			tabRow.content = styled(strip.segments);
			tabRow.visible = model.tabs.length > 0;
			banner.visible = model.pending !== null && model.pending !== model.path;
			bannerText.content = styled([
				{ text: " ● ", fg: d.accent },
				{ text: "o claude editou ", fg: d.fg },
				{ text: model.pending ?? "", fg: d.strong, bold: true },
				{ text: " " },
			]);
			empty.visible = model.path === null;
			gutter.visible = model.path !== null;
			if (!model.path) return;

			const view = diffView(model.rows, model.justLines);
			extra = view.extraHighlights;
			gutter.setLineNumbers(view.lineNumbers);
			gutter.setHideLineNumbers(view.hideLineNumbers);
			gutter.setLineSigns(view.signs);
			gutter.setLineColors(view.colors);
			const changed = shown.path !== model.path || shown.content !== view.content;
			if (!changed) return;
			code.filetype = pathToFiletype(model.path) ?? "text";
			code.content = view.content;
			// each new edit (a new justLines list) jumps to what claude just wrote, even at the same row as the last one;
			// the user's scroll stays when only the age or the gutter changed
			const newEdit = model.justLines.length > 0 && model.justLines !== shown.justLines;
			if (view.firstJust >= 0 && newEdit) {
				code.scrollY = Math.max(0, view.firstJust - JUST_TOP_MARGIN);
			} else if (shown.path !== model.path) {
				code.scrollY = 0;
			}
			shown = { path: model.path, content: view.content, justLines: model.justLines };
		},
		scroll(lines: number) {
			code.scrollY = Math.max(0, Math.min(code.maxScrollY, code.scrollY + lines));
		},
	};
}
