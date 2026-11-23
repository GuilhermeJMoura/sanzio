import { describe, expect, test } from "bun:test";
import { contextRows, diffLines } from "../../src/observe/diff.ts";
import { diffView, nextViewerMode, splitView } from "../../src/ui/diff-view.ts";

describe("AC2 the viewer: +/− lines colored, ◂ claude on the last edit", () => {
	const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
	const after = ["a", "b", "c", "d", "E", "e2", "f", "g", "h", "i", "j"];
	const rows = contextRows(diffLines(before, after), 1);

	test("rows become lines with numbers, signs and colors; gaps are folded text", () => {
		const v = diffView(rows, [5, 6]);
		expect(v.content.split("\n")).toEqual([
			"··· 3 linhas iguais",
			"d",
			"e",
			"E  ◂ claude",
			"e2",
			"f",
			"··· 4 linhas iguais",
		]);
		expect([...v.lineNumbers]).toEqual([
			[1, 4],
			[2, 5],
			[3, 5],
			[4, 6],
			[5, 7],
		]);
		expect([...v.hideLineNumbers]).toEqual([0, 6]);
		expect(v.signs.get(2)).toEqual({ after: " −", afterColor: "#ff5555" });
		expect(v.signs.get(3)?.after).toBe(" +");
		expect(v.colors.get(2)?.content).toBe("#422f3a");
		expect(v.colors.get(4)?.content).toBe("#2c3f3d");
		expect(v.firstJust).toBe(3);
	});

	test("only the first line of a run gets the marker, painted as phd.claude", () => {
		const v = diffView(rows, [5, 6]);
		const marks = v.extraHighlights.filter(([, , g]) => g === "phd.claude");
		expect(marks).toHaveLength(1);
		const [start, end] = marks[0] ?? [0, 0];
		expect(v.content.slice(start, end)).toBe("◂ claude");
	});

	test("without just lines there is no marker", () => {
		const v = diffView(rows, []);
		expect(v.content).not.toContain("◂ claude");
		expect(v.firstJust).toBe(-1);
	});
});

describe("AC7 the viewer modes: diff, arquivo marcado, lado a lado", () => {
	const ops = diffLines(["a", "b", "c"], ["a", "B", "c", "d"]);

	test("v cycles diff → arquivo → lado a lado → diff", () => {
		expect(nextViewerMode("diff")).toBe("marked");
		expect(nextViewerMode("marked")).toBe("split");
		expect(nextViewerMode("split")).toBe("diff");
	});

	test("arquivo marcado is every line, with the changed ones marked + / −", () => {
		const v = diffView(ops, [2, 4]);
		expect(v.content.split("\n")).toEqual(["a", "b", "B  ◂ claude", "c", "d  ◂ claude"]);
		expect(v.signs.get(1)?.after).toBe(" −");
		expect(v.signs.get(2)?.after).toBe(" +");
		expect(v.targets).toEqual([1, 2, 2, 3, 4]);
	});

	test("lado a lado: old left, new right, a blank where one side has no line", () => {
		const v = splitView(ops, []);
		expect(v.left.content.split("\n")).toEqual(["a", "b", "c", ""]);
		expect(v.right.content.split("\n")).toEqual(["a", "B", "c", "d"]);
		expect([...v.left.lineNumbers]).toEqual([
			[0, 1],
			[1, 2],
			[2, 3],
		]);
		expect([...v.left.hideLineNumbers]).toEqual([3]);
		expect(v.left.signs.get(1)?.after).toBe(" −");
		expect(v.right.signs.get(1)?.after).toBe(" +");
		expect(v.right.signs.get(3)?.after).toBe(" +");
	});
});
