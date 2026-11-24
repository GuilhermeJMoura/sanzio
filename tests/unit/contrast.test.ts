import { describe, expect, test } from "bun:test";
import type { ContrastPair } from "$types/theme.ts";
import { claudeTheme } from "../../src/claude-theme.ts";
import { THEMES } from "../../src/ui/theme.ts";
import { claudeThemePairs, contrast, themePairs } from "../helpers/contrast.ts";

const failuresOf = (pairs: ContrastPair[]) =>
	pairs.flatMap((pair) =>
		pair.bgs
			.map((bg) => ({ pair: pair.label, fg: pair.fg, bg, ratio: contrast(pair.fg, bg), min: pair.min }))
			.filter((r) => r.ratio < r.min)
			.map((r) => `${r.pair}: ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)} < ${r.min}`),
	);

describe("AC7 every text/background pair reaches WCAG contrast", () => {
	for (const t of Object.values(THEMES)) {
		test(`${t.name}: text ≥ 4.5:1, dim text and lines ≥ 3:1`, () => {
			expect(failuresOf(themePairs(t))).toEqual([]);
		});

		test(`${t.name}: claude's theme text on its diff, word, message and selection backgrounds`, () => {
			expect(failuresOf(claudeThemePairs(claudeTheme(t), t.bg))).toEqual([]);
		});
	}

	test("the WCAG formula: black on white is 21:1, a color on itself 1:1", () => {
		expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
		expect(contrast("#dcab4a", "#dcab4a")).toBe(1);
	});
});
