import type { CliRenderer, KeyEvent } from "@opentui/core";
import { BoxRenderable, TextRenderable } from "@opentui/core";
import type { ConflictAction, EditModel, PromptAction } from "$types/edit.ts";
import type { EditorModel, Segment } from "$types/workspace.ts";
import { createBanner } from "./banner.ts";
import { createEditSurface } from "./editor-textarea.ts";
import { createViewer } from "./editor-viewer.ts";
import { createSyntaxStyle, fileIcon, styled, theme } from "./theme.ts";

const d = theme;
const VIEWER_LABELS = { diff: "diff", marked: "arquivo", split: "lado a lado" } as const;

function followLabel(model: EditorModel): Segment[] {
	const mode: Segment[] = model.edit.active
		? []
		: [
				{ text: ` v ${VIEWER_LABELS[model.viewer]} `, fg: d.dim, bg: d.bg },
				{ text: "·", fg: d.faint, bg: d.bg },
			];
	return [
		...mode,
		model.follow === "following"
			? { text: " ● seguindo o claude ", fg: d.accent, bg: d.bg }
			: { text: " ◌ seguir pausado · f ", fg: d.dim, bg: d.bg },
	];
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

function title(model: EditorModel): string {
	if (!model.path) return " editor ";
	if (model.edit.readOnly) return ` ${model.path} · só leitura `;
	return model.edit.active && model.edit.dirty ? ` ${model.path} ● ` : ` ${model.path} `;
}

const PROMPT_TEXT = {
	switch: "alterações não salvas · trocar de arquivo?",
	follow: "alterações não salvas · voltar a seguir o claude?",
	leave: "alterações não salvas · sair da edição?",
	exit: "o claude saiu · alterações não salvas",
} as const;

export function createEditor(
	renderer: CliRenderer,
	handlers: {
		onFocus: () => void;
		onOpenPending: () => void;
		onDismiss: () => void;
		onTab: (path: string) => void;
		onEditAt?: (line: number) => void;
		onEditKey?: (key: KeyEvent) => void;
		onEditChange?: () => void;
		onConflict?: (action: ConflictAction) => void;
		onPrompt?: (action: PromptAction) => void;
	},
) {
	const box = new BoxRenderable(renderer, {
		id: "editor",
		width: "100%",
		flexGrow: 1,
		borderStyle: "rounded",
		borderColor: d.border,
		focusedBorderColor: d.accent,
		backgroundColor: d.bg,
		title: " editor ",
		titleColor: d.strong,
		focusable: true,
	});
	const follow = new TextRenderable(renderer, { id: "editor-follow", position: "absolute", top: -1, right: 1 });
	const tabRow = new TextRenderable(renderer, { id: "editor-tabs", width: "100%", height: 1, wrapMode: "none" });
	const notice = createBanner(renderer, "editor-banner", [
		{ label: "abrir", onClick: handlers.onOpenPending },
		{ label: "ignorar", onClick: handlers.onDismiss },
	]);
	const conflict = createBanner(renderer, "editor-conflict", [
		{ label: "recarregar", onClick: () => handlers.onConflict?.("reload") },
		{ label: "manter o meu", onClick: () => handlers.onConflict?.("keep") },
		{ label: "ver diff dele", onClick: () => handlers.onConflict?.("diff") },
	]);
	const prompt = createBanner(renderer, "editor-prompt", [
		{ label: "salvar s", onClick: () => handlers.onPrompt?.("save") },
		{ label: "descartar d", onClick: () => handlers.onPrompt?.("discard") },
		{ label: "cancelar esc", onClick: () => handlers.onPrompt?.("cancel") },
	]);

	const failure = createBanner(renderer, "editor-error", []);

	const empty = new TextRenderable(renderer, {
		id: "editor-empty",
		width: "100%",
		flexGrow: 1,
		content: styled([
			{ text: "\n  esperando o claude editar algo…\n", fg: d.dim },
			{ text: "  ou escolha um arquivo no explorer", fg: d.faint },
		]),
	});
	const style = createSyntaxStyle(renderer);
	const viewer = createViewer(renderer, style, (line) => handlers.onEditAt?.(line));
	const surface = createEditSurface(renderer, style, {
		onKey: (key) => handlers.onEditKey?.(key),
		onChange: () => handlers.onEditChange?.(),
	});

	for (const child of [
		follow,
		tabRow,
		notice.box,
		conflict.box,
		prompt.box,
		failure.box,
		empty,
		viewer.box,
		surface.gutter,
	]) {
		box.add(child);
	}
	let editing = false;
	box.onMouseDown = (event) => {
		// while editing, the click must not move the focus from the edit surface to this box
		if (editing) event.preventDefault();
		handlers.onFocus();
	};
	let tabRanges: [number, number, string][] = [];
	tabRow.onMouseDown = (event) => {
		const col = event.x - tabRow.x;
		const hit = tabRanges.find(([start, end]) => col >= start && col < end);
		if (hit) handlers.onTab(hit[2]);
	};

	const showBanners = (model: EditorModel, edit: EditModel) => {
		notice.show(model.pending !== null && model.pending !== model.path, [
			{ text: " ● ", fg: d.accent },
			{ text: "o claude editou ", fg: d.fg },
			{ text: model.pending ?? "", fg: d.strong, bold: true },
			{ text: " " },
		]);
		conflict.show(
			edit.conflict !== null,
			[
				{ text: " ● ", fg: d.mod },
				{ text: "o claude mudou este arquivo ", fg: d.fg },
			],
			["recarregar", "manter o meu", edit.conflict?.showingDiff ? "voltar ao meu" : "ver diff dele"],
		);
		failure.show(edit.error !== null, [
			{ text: " ✕ ", fg: d.del },
			{ text: edit.error ?? "", fg: d.fg },
			{ text: " · o texto continua aqui", fg: d.dim },
		]);
		prompt.show(edit.prompt !== null, [
			{ text: " ● ", fg: d.mod },
			{ text: edit.prompt ? PROMPT_TEXT[edit.prompt] : "", fg: d.fg },
			{ text: " " },
		]);
	};

	return {
		box,
		surface,
		update(model: EditorModel) {
			const edit = model.edit;
			editing = edit.active;
			box.title = title(model);
			box.titleColor = model.focused ? d.accent : d.strong;
			// the edit surface holds the focus while editing, not the box: paint the border from the model
			box.borderColor = model.focused ? d.accent : d.border;
			follow.content = styled(followLabel(model));
			const strip = tabs(model);
			tabRanges = strip.ranges;
			tabRow.content = styled(strip.segments);
			tabRow.visible = model.tabs.length > 0;
			showBanners(model, edit);
			empty.visible = model.path === null;
			const showingClaudeDiff = edit.conflict?.showingDiff === true;
			surface.gutter.visible = model.path !== null && edit.active && !showingClaudeDiff;
			viewer.box.visible = model.path !== null && (!edit.active || showingClaudeDiff);
			if (!model.path) return;
			if (edit.conflict?.showingDiff) viewer.showRows(model.path, edit.conflict.rows);
			else if (!edit.active)
				viewer.update({
					path: model.path,
					rows: model.rows,
					ops: model.ops,
					justLines: model.justLines,
					mode: model.viewer,
				});
		},
		scroll: viewer.scroll,
		topLine: viewer.topLine,
	};
}
