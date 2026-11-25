import type { SimpleHighlight, SyntaxStyle, TextareaRenderable, TextChunk } from "@opentui/core";
import { getTreeSitterClient, measureEditText, TextAttributes, treeSitterToTextChunks } from "@opentui/core";

// one highlight pass at most this long after a change, however fast the typing: tree-sitter runs in its worker
const DELAY_MS = 50;

const flag = (attributes: number, bit: number) => (attributes & bit) !== 0;

/**
 * The viewer's syntax colors on the edit area: the same tree-sitter highlights and style, nothing concealed. Each pass
 * runs off the key path and paints only if the text is still the one it highlighted.
 */
export function createEditHighlighter(area: TextareaRenderable, style: SyntaxStyle) {
	const client = getTreeSitterClient();
	const styleIds = new Map<string, number>();
	let filetype: string | undefined;
	let scheduled = false;
	let running = false;
	let again = false;

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

	const paint = (text: string, highlights: SimpleHighlight[]) => {
		area.clearAllHighlights();
		if (highlights.length === 0) return;
		const names: string[][] = [];
		const chunks = treeSitterToTextChunks(text, highlights, style, {
			enabled: false,
			names,
		});
		const widthMethod = area.ctx.widthMethod;
		let line = 0;
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
				const width = measureEditText(part, { widthMethod });
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

	const run = async () => {
		scheduled = false;
		if (running) {
			again = true;
			return;
		}
		running = true;
		try {
			do {
				again = false;
				const text = area.plainText;
				const type = filetype;
				const answer = type ? await client.highlightOnce(text, type).catch(() => ({ highlights: [] })) : null;
				if (area.isDestroyed) return;
				// typed (or undone) meanwhile: the next pass paints the current text
				if (text !== area.plainText || type !== filetype) again = true;
				else paint(text, answer?.highlights ?? []);
			} while (again);
		} finally {
			running = false;
		}
	};

	const schedule = () => {
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
