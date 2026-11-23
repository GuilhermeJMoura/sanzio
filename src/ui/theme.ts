import { type CliRenderer, RGBA, StyledText, SyntaxStyle, TextAttributes } from "@opentui/core";
import type { Segment } from "$types/workspace.ts";

/** Dracula, as in the approved mock: one purple accent, Claude's coral only for the "◂ claude" marker. */
export const DRACULA = {
	desk: "#21222c",
	bg: "#282a36",
	bar: "#191a21",
	line: "#343746",
	line2: "#44475a",
	fg: "#f8f8f2",
	strong: "#ffffff",
	dim: "#a4a8c4",
	faint: "#6272a4",
	accent: "#bd93f9",
	accentDim: "#9580c9",
	accentBg: "#3d3951",
	add: "#50fa7b",
	addBg: "#2c3f3d",
	del: "#ff5555",
	delBg: "#422f3a",
	mod: "#ffb86c",
	pink: "#ff79c6",
	yellow: "#f1fa8c",
	cyan: "#8be9fd",
	tsIcon: "#78c6d9",
} as const;

export const CLAUDE_MARK = "  ◂ claude";

export function createSyntaxStyle(renderer: CliRenderer): SyntaxStyle {
	const d = DRACULA;
	return SyntaxStyle.fromStyles(
		{
			default: { fg: d.fg },
			keyword: { fg: d.pink },
			"keyword.import": { fg: d.pink },
			operator: { fg: d.pink },
			string: { fg: d.yellow },
			"string.special": { fg: d.yellow },
			number: { fg: d.accent },
			boolean: { fg: d.accent },
			constant: { fg: d.accent },
			"constant.builtin": { fg: d.accent },
			function: { fg: d.add },
			"function.method": { fg: d.add },
			"function.call": { fg: d.add },
			type: { fg: d.cyan, italic: true },
			"type.builtin": { fg: d.cyan, italic: true },
			constructor: { fg: d.cyan },
			property: { fg: d.fg },
			variable: { fg: d.fg },
			"variable.parameter": { fg: d.mod, italic: true },
			"variable.builtin": { fg: d.accent, italic: true },
			comment: { fg: d.faint, italic: true },
			punctuation: { fg: d.fg },
			"markup.heading": { fg: d.accent, bold: true },
			"markup.raw": { fg: d.add },
			"markup.link": { fg: d.cyan, underline: true },
			"markup.strong": { bold: true },
			"markup.italic": { italic: true },
			"phd.claude": { fg: d.accentDim, italic: true },
			"phd.gap": { fg: d.faint },
		},
		renderer.nativeScene,
	);
}

/** File glyph and color used in the explorer and the editor tabs. */
export function fileIcon(path: string): { glyph: string; color: string } {
	const ext = path.slice(path.lastIndexOf(".") + 1);
	if (["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext)) return { glyph: "◆", color: DRACULA.tsIcon };
	if (["json", "jsonc", "toml", "yaml", "yml"].includes(ext)) return { glyph: "◇", color: DRACULA.mod };
	if (["md", "mdx"].includes(ext)) return { glyph: "¶", color: DRACULA.pink };
	return { glyph: "·", color: DRACULA.dim };
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
