import type { Cell, MaybeColor, PixelGrid, SplashFrame } from "$types/theme.ts";
import { mix, WORD, wordPixels } from "./logo.ts";
import { PORTRAIT_COMPACT, PORTRAIT_LARGE } from "./portrait.ts";
import { theme } from "./theme.ts";

export const HINT = "qualquer tecla continua";
const LARGE = { portrait: 30, rows: 18, gap: 3, word: 46 };
/** frame + gap + word: the large splash needs this many columns */
export const LARGE_WIDTH = LARGE.portrait + 2 + LARGE.gap + LARGE.word;
/** frame, a blank row, the rule, a blank row and the hint */
export const LARGE_HEIGHT = LARGE.rows + 6;
const COMPACT = { portrait: 16, rows: 10 };
export const COMPACT_WIDTH = COMPACT.portrait + 2 + 2 + HINT.length;
export const COMPACT_HEIGHT = COMPACT.rows + 2;

class Canvas {
	readonly rows: Cell[][];
	constructor(
		readonly width: number,
		readonly height: number,
	) {
		this.rows = Array.from({ length: height }, () =>
			Array.from({ length: width }, () => ({ char: " ", fg: theme.fg, bg: theme.bg, bold: false })),
		);
	}

	cell(x: number, y: number): Cell | undefined {
		return this.rows[y]?.[x];
	}

	put(x: number, y: number, text: string, fg: string, bold = false) {
		for (const char of text) {
			const cell = this.cell(x++, y);
			if (cell) Object.assign(cell, { char, fg, bold });
		}
	}

	/** Soft light behind the portrait: the pane color blended toward the glow, strongest at the center. */
	glow(cx: number, cy: number, w: number, h: number) {
		this.rows.forEach((row, y) => {
			row.forEach((cell, x) => {
				const d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
				if (d < 1) cell.bg = mix(theme.bg, theme.glow, (1 - d) ** 1.4);
			});
		});
	}

	/** Each cell is ▀: fg the even pixel row, bg the odd one under it. A thin gold line frames it. */
	portrait(grid: PixelGrid, x: number, y: number) {
		const w = grid[0]?.length ?? 0;
		const h = grid.length / 2;
		const gold = theme.gold;
		this.put(x - 1, y - 1, `╭${"─".repeat(w)}╮`, gold);
		this.put(x - 1, y + h, `╰${"─".repeat(w)}╯`, gold);
		for (let r = 0; r < h; r++) {
			this.put(x - 1, y + r, "│", gold);
			this.put(x + w, y + r, "│", gold);
			for (let c = 0; c < w; c++) {
				const cell = this.cell(x + c, y + r);
				const top = grid[2 * r]?.[c];
				const bottom = grid[2 * r + 1]?.[c];
				if (cell && top && bottom) Object.assign(cell, { char: "▀", fg: top, bg: bottom, bold: false });
			}
		}
	}

	/** Pixels two to a cell; a cell with ink only above or below keeps the background it has. */
	blit(pixels: MaybeColor[][], x0: number, y0: number) {
		for (let r = 0; r < pixels.length / 2; r++) {
			const top = pixels[2 * r] ?? [];
			const bottom = pixels[2 * r + 1] ?? [];
			top.forEach((t, c) => {
				const b = bottom[c] ?? null;
				const cell = this.cell(x0 + c, y0 + r);
				if (!cell || (!t && !b)) return;
				if (t && b) Object.assign(cell, t === b ? { char: "█", fg: t } : { char: "▀", fg: t, bg: b });
				else if (t) Object.assign(cell, { char: "▀", fg: t });
				else if (b) Object.assign(cell, { char: "▄", fg: b });
			});
		}
	}
}

/** The opening over the claude pane's inside (`width` × `height` cells), or null when not even the compact one fits. */
export function splashFrame(width: number, height: number): SplashFrame | null {
	const canvas = new Canvas(Math.max(0, width), Math.max(0, height));
	const frame = (kind: SplashFrame["kind"], x: number, y: number): SplashFrame => ({
		kind,
		width,
		height,
		rows: canvas.rows,
		portrait: { x, y },
	});

	if (width >= LARGE_WIDTH && height >= LARGE_HEIGHT) {
		const top = Math.floor((height - LARGE_HEIGHT) / 2);
		const left = Math.floor((width - LARGE_WIDTH) / 2);
		canvas.glow(width / 2, top + LARGE.rows / 2 + 1, LARGE_WIDTH + 22, LARGE.rows + 8);
		canvas.portrait(PORTRAIT_LARGE, left + 1, top + 1);
		canvas.blit(wordPixels(), left + LARGE.portrait + 2 + LARGE.gap, top + 1 + Math.floor((LARGE.rows - 5) / 2));
		const ruleY = top + LARGE.rows + 3;
		canvas.put(left, ruleY, "─".repeat(LARGE_WIDTH), theme.dim);
		canvas.put(left + Math.floor(LARGE_WIDTH / 2), ruleY, "✦", theme.gold, true);
		canvas.put(Math.floor((width - HINT.length) / 2), top + LARGE.rows + 5, HINT, theme.dim);
		return frame("large", left + 1, top + 1);
	}
	if (width >= COMPACT_WIDTH && height >= COMPACT_HEIGHT) {
		const top = Math.floor((height - COMPACT_HEIGHT) / 2);
		const left = Math.floor((width - COMPACT_WIDTH) / 2);
		canvas.glow(width / 2, top + COMPACT.rows / 2 + 1, COMPACT_WIDTH + 14, COMPACT.rows + 6);
		canvas.portrait(PORTRAIT_COMPACT, left + 1, top + 1);
		canvas.put(left + COMPACT.portrait + 4, top + 5, WORD, theme.accent, true);
		canvas.put(left + COMPACT.portrait + 4, top + 7, HINT, theme.dim);
		return frame("compact", left + 1, top + 1);
	}
	// very narrow: the name and the hint go under the portrait
	if (width >= HINT.length && height >= COMPACT_HEIGHT + 3) {
		const top = Math.floor((height - COMPACT_HEIGHT - 3) / 2);
		const left = Math.floor((width - COMPACT.portrait - 2) / 2);
		canvas.portrait(PORTRAIT_COMPACT, left + 1, top + 1);
		canvas.put(Math.floor((width - WORD.length) / 2), top + COMPACT_HEIGHT, WORD, theme.accent, true);
		canvas.put(Math.floor((width - HINT.length) / 2), top + COMPACT_HEIGHT + 2, HINT, theme.dim);
		return frame("stacked", left + 1, top + 1);
	}
	return null;
}
