import { BoxRenderable, type CliRenderer, TextRenderable } from "@opentui/core";
import type { ChangedRow, ExplorerItem, ExplorerLine, ExplorerModel, Segment } from "$types/workspace.ts";
import { DRACULA, fileIcon, styled } from "./theme.ts";

const d = DRACULA;

export function explorerItems(m: ExplorerModel): ExplorerItem[] {
	return [
		...m.changed.map((r) => ({ kind: "file" as const, path: r.path })),
		...m.mine.map((r) => ({ kind: "file" as const, path: r.path })),
		...m.tree.map((r) => ({ kind: r.kind, path: r.path })),
	];
}

const width = (segments: Segment[]) => segments.reduce((n, s) => n + s.text.length, 0);

/** Left part truncated with … so that left + right fit in `cols`; right stays whole. */
function fit(left: Segment[], right: Segment[], cols: number, bg?: string): Segment[] {
	const room = Math.max(0, cols - width(right));
	const out: Segment[] = [];
	let used = 0;
	for (const s of left) {
		if (used >= room) break;
		const text = used + s.text.length > room ? `${s.text.slice(0, Math.max(0, room - used - 1))}…` : s.text;
		out.push({ ...s, text });
		used += text.length;
	}
	out.push({ text: " ".repeat(Math.max(0, cols - used - width(right))) }, ...right);
	return bg ? out.map((s) => ({ ...s, bg })) : out;
}

function section(title: string, count: string, cols: number): ExplorerLine {
	const rule = "─".repeat(Math.max(1, cols - title.length - count.length - 4));
	return { item: null, segments: [{ text: ` ${title} ${rule} ${count} `, fg: d.faint }] };
}

/** The explorer as lines of cells: "claude editou", "você editou" (when any) then the repo tree, each selectable line tied to an item. */
export function explorerLines(m: ExplorerModel, cols: number): ExplorerLine[] {
	const lines: ExplorerLine[] = [section("claude editou", String(m.changed.length), cols)];
	let item = 0;
	const row = (left: Segment[], right: Segment[], path: string): ExplorerLine => {
		const index = item++;
		const open = path === m.open;
		const cursor = m.focused && index === m.cursor;
		const bg = open ? d.line2 : cursor ? d.line : undefined;
		const bar: Segment = { text: open ? "▎" : " ", fg: d.accent };
		return { item: index, segments: fit([bar, ...left], right, cols, bg) };
	};
	if (m.changed.length === 0) {
		lines.push({ item: null, segments: [{ text: " o que o claude editar aparece aqui", fg: d.faint }] });
	}
	const changedRow = (r: ChangedRow) => {
		const icon = fileIcon(r.path);
		lines.push(
			row(
				[
					{ text: `${icon.glyph} `, fg: icon.color },
					{ text: r.name, fg: r.isNew ? d.add : d.mod },
					{ text: r.dir ? ` ${r.dir}` : "", fg: d.faint },
				],
				[
					{ text: ` +${r.added}`, fg: d.add },
					{ text: ` −${r.removed}`, fg: d.del },
					{ text: ` ${r.age.padStart(5)} `, fg: d.faint },
				],
				r.path,
			),
		);
	};
	m.changed.forEach(changedRow);
	if (m.mine.length > 0) {
		lines.push({ item: null, segments: [{ text: "" }] }, section("você editou", String(m.mine.length), cols));
		m.mine.forEach(changedRow);
	}
	lines.push({ item: null, segments: [{ text: "" }] }, section(m.rootName, "", cols));
	for (const r of m.tree) {
		const indent = { text: "  ".repeat(r.depth) };
		if (r.kind === "dir") {
			lines.push(
				row(
					[
						indent,
						{ text: r.expanded ? "▾ " : "▸ ", fg: d.faint },
						{ text: `${r.name}/`, fg: r.dirty ? d.mod : d.dim },
					],
					[],
					r.path,
				),
			);
			continue;
		}
		const icon = fileIcon(r.path);
		const color = r.mark === "U" ? d.add : r.mark === "M" ? d.mod : d.fg;
		const right: Segment[] = [];
		if (r.live) right.push({ text: " ●", fg: d.accent });
		if (r.mark) right.push({ text: ` ${r.mark}`, fg: r.mark === "U" ? d.add : d.mod, bold: true });
		right.push({ text: " " });
		lines.push(row([indent, { text: `${icon.glyph} `, fg: icon.color }, { text: r.name, fg: color }], right, r.path));
	}
	return lines;
}

export function createExplorer(
	renderer: CliRenderer,
	handlers: { onItem: (index: number) => void; onFocus: () => void },
) {
	const box = new BoxRenderable(renderer, {
		id: "explorer",
		height: "100%",
		flexShrink: 0,
		borderStyle: "rounded",
		borderColor: d.line2,
		focusedBorderColor: d.accent,
		backgroundColor: d.bg,
		title: " explorer ",
		titleColor: d.strong,
		focusable: true,
	});
	const body = new TextRenderable(renderer, { id: "explorer-body", width: "100%", flexGrow: 1, wrapMode: "none" });
	box.add(body);

	let lines: ExplorerLine[] = [];
	let offset = 0;
	let last: ExplorerModel | null = null;
	const paint = () => {
		if (!last) return;
		const cols = Math.max(1, box.width - 2);
		const rows = Math.max(1, box.height - 2);
		lines = explorerLines(last, cols);
		const cursorLine = lines.findIndex((l) => l.item === last?.cursor);
		if (last.focused && cursorLine >= 0) {
			if (cursorLine < offset) offset = cursorLine;
			if (cursorLine >= offset + rows) offset = cursorLine - rows + 1;
		}
		offset = Math.max(0, Math.min(offset, lines.length - rows));
		const visible = lines.slice(offset, offset + rows);
		body.content = styled(visible.flatMap((l, i) => (i === 0 ? l.segments : [{ text: "\n" }, ...l.segments])));
	};

	box.onMouseDown = (event) => {
		handlers.onFocus();
		const line = lines[offset + event.y - box.y - 1];
		if (line?.item !== null && line?.item !== undefined) handlers.onItem(line.item);
	};
	box.onMouseScroll = (event) => {
		offset += event.scroll?.direction === "up" ? -3 : 3;
		paint();
	};
	box.onSizeChange = paint;

	return {
		box,
		update(model: ExplorerModel) {
			last = model;
			box.titleColor = model.focused ? d.accent : d.strong;
			paint();
		},
	};
}
