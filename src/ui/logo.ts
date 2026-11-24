import type { Glyph, MaybeColor } from "$types/theme.ts";
import type { Segment } from "$types/workspace.ts";
import { theme } from "./theme.ts";

export const WORD = "Sanzio";
/** Pixel rows of the big word: 10, drawn as 5 rows of half blocks. */
export const WORD_PIXEL_ROWS = 10;

const GLYPHS: Record<string, Glyph> = {
	S: {
		top: 0,
		rows: [
			"..#####.",
			".##..###",
			"##.....#",
			"##......",
			".####...",
			"..#####.",
			".....###",
			"......##",
			"#....###",
			".#####..",
		],
	},
	a: { top: 4, rows: [".#####.", ".....##", ".######", "##...##", "##...##", ".#####."] },
	n: { top: 4, rows: ["##.####.", ".###..##", ".##...##", ".##...##", ".##...##", "####.###"] },
	z: { top: 4, rows: ["#######", "#....##", "....##.", "..##...", ".##....", "#######"] },
	i: { top: 1, rows: [".##.", ".##.", "....", "###.", ".##.", ".##.", ".##.", ".##.", "####"] },
	o: { top: 4, rows: [".#####.", "##...##", "##...##", "##...##", "##...##", ".#####."] },
};

const channels = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** The color `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
	const from = channels(a);
	const to = channels(b);
	return `#${from
		.map((v, i) =>
			Math.round(v + ((to[i] ?? v) - v) * t)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** "Sanzio" as pixels: the initial S in vermilion, the rest a gold gradient top to bottom; null is no ink. */
export function wordPixels(): MaybeColor[][] {
	const w = theme.word;
	const pixels: MaybeColor[][] = Array.from({ length: WORD_PIXEL_ROWS }, () => []);
	[...WORD].forEach((letter, index) => {
		const glyph = GLYPHS[letter];
		if (!glyph) return;
		const width = glyph.rows[0]?.length ?? 0;
		for (let y = 0; y < WORD_PIXEL_ROWS; y++) {
			const row = glyph.rows[y - glyph.top];
			const line = pixels[y] ?? [];
			for (let x = 0; x < width; x++) {
				const on = row?.[x] === "#";
				line.push(on ? (index === 0 ? w.initial : mix(w.top, w.bottom, y / (WORD_PIXEL_ROWS - 1))) : null);
			}
			if (index < WORD.length - 1) line.push(null);
		}
	});
	return pixels;
}

/** The one-line Sanzio mark: the name in the theme's gold with a vermilion initial S, no icon. */
export function markSegments(): Segment[] {
	const st = theme.status;
	return [
		{ text: "S", fg: st.markInitial, bold: true },
		{ text: "anzio", fg: st.markName, bold: true },
	];
}
