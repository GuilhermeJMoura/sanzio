import type { SimpleHighlight, SyntaxStyle, TextareaRenderable, TextChunk, WidthMethod } from "@opentui/core";
import { getTreeSitterClient, measureEditText, TextAttributes, treeSitterToTextChunks } from "@opentui/core";
import { registerParsers } from "./parsers.ts";

// one highlight pass at most this long after a change, however fast the typing: tree-sitter runs in its worker
const DELAY_MS = 50;
// painting gives the event loop back this often, so a key never waits behind a big file's colors
const SLICE_MS = 6;
const LINES_PER_STEP = 40;
const ASCII = /^[\x20-\x7e]*$/;
registerParsers();

const flag = (attributes: number, bit: number) => (attributes & bit) !== 0;
const yieldToKeys = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Where each line starts in `text`, plus the end of the text. */
function lineStarts(text: string): number[] {
	const starts = [0];
	for (let at = text.indexOf("\n"); at >= 0; at = text.indexOf("\n", at + 1)) starts.push(at + 1);
	starts.push(text.length + 1);
	return starts;
}

/**
 * The viewer's syntax colors on the edit area: the same tree-sitter highlights and style, nothing concealed. Each pass
 * runs off the key path, paints a few lines at a time and stops as soon as the text changes under it.
 */
export function createEditHighlighter(area: TextareaRenderable, style: SyntaxStyle, widthMethod: WidthMethod) {
	const client = getTreeSitterClient();
	const styleIds = new Map<string, number>();
	let filetype: string | undefined;
	let version = 0;
	let scheduled = false;
	let running = false;

	// a chunk merges one or more style names (keyword, string.special…) into one look: one registered style per mix
	const styleId = (names: string[], chunk: TextChunk) => {
		const key = `sanzio.edit:${names.join("+")}`;
		let id = styleIds.get(key);
		if (id === undefined) {
			const attributes = chunk.attributes ?? 0;
			id = style.registerStyle(key, {
				fg: chunk.fg,
				bg: chunk.bg,
				bold: flag(attributes, TextAttributes.BOLD),
				italic: flag(attributes, TextAttributes.ITALIC),
				underline: flag(attributes, TextAttributes.UNDERLINE),
				dim: flag(attributes, TextAttributes.DIM),
				strikethrough: flag(attributes, TextAttributes.STRIKETHROUGH),
			});
			styleIds.set(key, id);
		}
		return id;
	};

	/** Paints lines [first, last) of `text`, which span [from, to), with the highlights that touch them. */
	const paintLines = (
		text: string,
		touching: SimpleHighlight[],
		first: number,
		last: number,
		from: number,
		to: number,
	) => {
		for (let line = first; line < last; line++) area.clearLineHighlights(line);
		if (touching.length === 0) return;
		// clipped to these lines, in tree-sitter's order: the merge (and its ties) is the viewer's
		const clipped = touching.map(
			([start, end, group, meta]): SimpleHighlight => [
				Math.max(start, from) - from,
				Math.min(end, to) - from,
				group,
				meta,
			],
		);
		const names: string[][] = [];
		const chunks = treeSitterToTextChunks(text.slice(from, to), clipped, style, { enabled: false, names });
		let line = first;
		let col = 0;
		chunks.forEach((chunk, i) => {
			const groups = names[i] ?? ["default"];
			const plain = groups.length === 1 && groups[0] === "default";
			chunk.text.split("\n").forEach((part, n) => {
				if (n > 0) {
					line++;
					col = 0;
				}
				if (!part) return;
				const width = ASCII.test(part) ? part.length : measureEditText(part, { widthMethod });
				if (!plain)
					area.addHighlight(line, {
						start: col,
						end: col + width,
						styleId: styleId(groups, chunk),
					});
				col += width;
			});
		});
	};

	/** False when the text changed before the whole of it was painted. */
	const paint = async (text: string, highlights: SimpleHighlight[], current: () => boolean): Promise<boolean> => {
		const order = new Map(highlights.map((h, i) => [h, i]));
		const byStart = highlights.filter(([start, end]) => start < end).sort((a, b) => a[0] - b[0]);
		const starts = lineStarts(text);
		const lines = starts.length - 1;
		let next = 0;
		let open: SimpleHighlight[] = [];
		let sliceStart = performance.now();
		for (let first = 0; first < lines; first += LINES_PER_STEP) {
			if (performance.now() - sliceStart > SLICE_MS) {
				await yieldToKeys();
				if (!current()) return false;
				sliceStart = performance.now();
			}
			const last = Math.min(first + LINES_PER_STEP, lines);
			const from = starts[first] ?? 0;
			const to = Math.min(starts[last] ?? text.length, text.length);
			open = open.filter(([, end]) => end > from);
			for (let h = byStart[next]; h && h[0] < to; h = byStart[++next]) open.push(h);
			const touching = [...open].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
			paintLines(text, touching, first, last, from, to);
		}
		return true;
	};

	const run = async () => {
		scheduled = false;
		if (running) return;
		running = true;
		try {
			for (let done = false; !done && !area.isDestroyed; ) {
				const pass = version;
				const current = () => pass === version && !area.isDestroyed;
				const text = area.plainText;
				const type = filetype;
				const answer = type ? await client.highlightOnce(text, type).catch(() => ({ highlights: [] })) : null;
				// typed (or undone) meanwhile: the next turn of the loop highlights the current text
				if (!current()) continue;
				done = await paint(text, answer?.highlights ?? [], current);
			}
		} finally {
			running = false;
		}
	};

	const schedule = () => {
		version++;
		if (scheduled) return;
		scheduled = true;
		setTimeout(run, DELAY_MS);
	};

	return {
		schedule,
		/** The language of the edited file (undefined: no colors, plain fg). */
		setFiletype(next: string | undefined) {
			if (next === filetype) return;
			filetype = next;
			schedule();
		},
	};
}
