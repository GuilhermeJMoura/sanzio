import type { ContrastPair, Theme } from "$types/theme.ts";

const linear = (c: number) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => linear(Number.parseInt(hex.slice(i, i + 2), 16)));
	return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** Every text/background pair sanzio paints, with its minimum: 4.5:1 for text, 3:1 for dim text and lines. */
export function themePairs(t: Theme): ContrastPair[] {
	const s = t.syntax;
	const st = t.status;
	const code = [t.bg, t.addBg, t.delBg];
	return [
		{ label: "text", fg: t.fg, bgs: [t.bg, t.raised, t.sel, t.glow, t.bar], min: 4.5 },
		{ label: "strong text / title", fg: t.strong, bgs: [t.bg], min: 4.5 },
		{ label: "focused title / keys", fg: t.accent, bgs: [t.bg, t.bar], min: 4.5 },
		{ label: "dim text", fg: t.dim, bgs: [t.bg, t.desk, t.bar, t.raised, t.glow], min: 3 },
		{ label: "faint text / line numbers", fg: t.faint, bgs: [t.bg, t.bar], min: 3 },
		{ label: "border", fg: t.border, bgs: [t.bg, t.desk], min: 3 },
		{ label: "focused border", fg: t.accent, bgs: [t.bg, t.desk], min: 3 },
		{ label: "portrait frame", fg: t.gold, bgs: [t.bg, t.glow], min: 3 },
		{ label: "modified", fg: t.mod, bgs: [t.bg, t.sel, t.raised], min: 4.5 },
		{ label: "added", fg: t.add, bgs: [t.addBg, t.bg, t.bar, t.raised], min: 4.5 },
		{ label: "removed", fg: t.del, bgs: [t.delBg, t.bg, t.bar, t.raised], min: 4.5 },
		{ label: "◂ claude", fg: t.gold, bgs: [t.bg, t.addBg], min: 4.5 },
		{ label: "just-edited sign", fg: t.accent, bgs: [t.glow], min: 3 },
		{ label: "file icon", fg: t.lapis, bgs: [t.bg, t.sel, t.raised], min: 3 },
		{ label: "primary button / EDITANDO", fg: t.bg, bgs: [t.accent, t.mod], min: 4.5 },
		{ label: "splash name", fg: t.accent, bgs: [t.bg, t.glow], min: 4.5 },
		{ label: "syntax keyword", fg: s.keyword, bgs: code, min: 4.5 },
		{ label: "syntax string", fg: s.string, bgs: code, min: 4.5 },
		{ label: "syntax function", fg: s.function, bgs: code, min: 4.5 },
		{ label: "syntax type", fg: s.type, bgs: code, min: 4.5 },
		{ label: "syntax number", fg: s.number, bgs: code, min: 4.5 },
		{ label: "syntax comment", fg: s.comment, bgs: code, min: 4.5 },
		{ label: "status mark name", fg: st.markName, bgs: [t.bar], min: 4.5 },
		{ label: "status mark S", fg: st.markInitial, bgs: [t.bar], min: 4.5 },
		{ label: "status mode", fg: st.modeFg, bgs: [st.modeBg], min: 4.5 },
		{ label: "status branch", fg: st.branchFg, bgs: [st.branchBg], min: 4.5 },
		{ label: "status warning", fg: st.warnFg, bgs: [st.warnBg], min: 4.5 },
	];
}
