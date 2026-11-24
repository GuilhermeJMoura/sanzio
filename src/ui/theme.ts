import { type CliRenderer, RGBA, StyledText, SyntaxStyle, TextAttributes } from "@opentui/core";
import type { Theme, ThemeName } from "$types/theme.ts";
import type { Segment } from "$types/workspace.ts";

/** Dark: the olive-brown ground of Raphael's portraits, parchment text, gold, lapis lazuli and earth green / vermilion. */
export const VERNIZ: Theme = {
	name: "verniz",
	desk: "#1b170f",
	bg: "#2a2519",
	bar: "#14110b",
	glow: "#43391f",
	border: "#85774f",
	raised: "#3a3120",
	sel: "#24407a",
	fg: "#ece1c6",
	strong: "#fbf3dc",
	dim: "#bcae8c",
	faint: "#9d906d",
	accent: "#dcab4a",
	gold: "#dcab4a",
	lapis: "#86aaee",
	add: "#b0cd78",
	addBg: "#34401f",
	del: "#f69a84",
	delBg: "#4b2318",
	mod: "#e3ad66",
	syntax: {
		keyword: "#f59a7c",
		string: "#b0cd78",
		function: "#8fb4f0",
		type: "#dcab4a",
		number: "#e3ad66",
		comment: "#bcae8c",
	},
	status: {
		markInitial: "#e8694c",
		markName: "#dcab4a",
		branchBg: "#3a3120",
		branchFg: "#ece1c6",
		modeBg: "#24407a",
		modeFg: "#fbf3dc",
		warnBg: "#b3321f",
		warnFg: "#fff4dc",
	},
	word: { top: "#e8bd5c", bottom: "#b88a2c", initial: "#e8694c" },
};

/** Light: fresco and parchment ground, sepia text, lapis lazuli and vermilion; gold and vermilion darkened for 4.5:1. */
export const PERGAMINHO: Theme = {
	name: "pergaminho",
	desk: "#e2d2ac",
	bg: "#f1e6c8",
	bar: "#d4bf8f",
	glow: "#fbf3dc",
	border: "#7f6a40",
	raised: "#e3d3ab",
	sel: "#c7d3ea",
	fg: "#3b2a1a",
	strong: "#1f1409",
	dim: "#5f4a30",
	faint: "#66523a",
	accent: "#1f4a8f",
	gold: "#7a4f08",
	lapis: "#1f4a8f",
	add: "#3a561a",
	addBg: "#dde5b5",
	del: "#8f2112",
	delBg: "#f0cdbd",
	mod: "#7a4f08",
	syntax: {
		keyword: "#a82a18",
		string: "#3a561a",
		function: "#1f4a8f",
		type: "#7a4f08",
		number: "#8a3b12",
		comment: "#66523a",
	},
	status: {
		markInitial: "#8f2112",
		markName: "#6a4204",
		branchBg: "#c2ab78",
		branchFg: "#3b2a1a",
		modeBg: "#1f4a8f",
		modeFg: "#f6ecd0",
		warnBg: "#a82a18",
		warnFg: "#fbf1d6",
	},
	word: { top: "#3b2a1a", bottom: "#1f4a8f", initial: "#a82a18" },
};

export const THEMES: Record<ThemeName, Theme> = { verniz: VERNIZ, pergaminho: PERGAMINHO };

/** The theme in use. One object for the whole app: `useTheme` swaps its tokens in place before the UI is built. */
export const theme: Theme = structuredClone(VERNIZ);

export function useTheme(name: ThemeName): void {
	Object.assign(theme, structuredClone(THEMES[name]));
}

export const CLAUDE_MARK = "  ◂ claude";

export function createSyntaxStyle(renderer: CliRenderer): SyntaxStyle {
	const t = theme;
	const s = t.syntax;
	return SyntaxStyle.fromStyles(
		{
			default: { fg: t.fg },
			keyword: { fg: s.keyword },
			"keyword.import": { fg: s.keyword },
			operator: { fg: s.keyword },
			string: { fg: s.string },
			"string.special": { fg: s.string },
			number: { fg: s.number },
			boolean: { fg: s.number },
			constant: { fg: s.number },
			"constant.builtin": { fg: s.number },
			function: { fg: s.function },
			"function.method": { fg: s.function },
			"function.call": { fg: s.function },
			type: { fg: s.type, italic: true },
			"type.builtin": { fg: s.type, italic: true },
			constructor: { fg: s.type },
			property: { fg: t.fg },
			variable: { fg: t.fg },
			"variable.parameter": { fg: t.mod, italic: true },
			"variable.builtin": { fg: s.number, italic: true },
			comment: { fg: s.comment, italic: true },
			punctuation: { fg: t.fg },
			"markup.heading": { fg: t.accent, bold: true },
			"markup.raw": { fg: s.string },
			"markup.link": { fg: t.lapis, underline: true },
			"markup.strong": { bold: true },
			"markup.italic": { italic: true },
			"phd.claude": { fg: t.gold, italic: true },
			"phd.gap": { fg: t.faint },
		},
		renderer.nativeScene,
	);
}

/** File glyph and color used in the explorer and the editor tabs. */
export function fileIcon(path: string): { glyph: string; color: string } {
	const ext = path.slice(path.lastIndexOf(".") + 1);
	if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) return { glyph: "◆", color: theme.lapis };
	if (["json", "jsonc", "toml", "yaml", "yml"].includes(ext)) return { glyph: "◇", color: theme.mod };
	if (["md", "mdx"].includes(ext)) return { glyph: "¶", color: theme.syntax.keyword };
	return { glyph: "·", color: theme.dim };
}

export function styled(segments: Segment[]): StyledText {
	return new StyledText(
		segments.map((s) => ({
			__isChunk: true as const,
			text: s.text,
			fg: s.fg ? RGBA.fromHex(s.fg) : undefined,
			bg: s.bg ? RGBA.fromHex(s.bg) : undefined,
			attributes:
				(s.bold ? TextAttributes.BOLD : 0) |
				(s.italic ? TextAttributes.ITALIC : 0) |
				(s.underline ? TextAttributes.UNDERLINE : 0),
		})),
	);
}
