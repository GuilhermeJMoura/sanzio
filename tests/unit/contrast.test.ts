import { describe, expect, test } from "bun:test";
import { THEMES } from "../../src/ui/theme.ts";
import { contrast, themePairs } from "../helpers/contrast.ts";

describe("AC7 every text/background pair reaches WCAG contrast", () => {
	for (const t of Object.values(THEMES)) {
		test(`${t.name}: text ≥ 4.5:1, dim text and lines ≥ 3:1`, () => {
			const failures = themePairs(t).flatMap((pair) =>
				pair.bgs
					.map((bg) => ({ pair: pair.label, fg: pair.fg, bg, ratio: contrast(pair.fg, bg), min: pair.min }))
					.filter((r) => r.ratio < r.min)
					.map((r) => `${r.pair}: ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)} < ${r.min}`),
			);
			expect(failures).toEqual([]);
		});
	}

	test("the WCAG formula: black on white is 21:1, a color on itself 1:1", () => {
		expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
		expect(contrast("#dcab4a", "#dcab4a")).toBe(1);
	});
});
