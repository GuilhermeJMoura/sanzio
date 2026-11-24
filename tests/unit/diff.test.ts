import { describe, expect, test } from "bun:test";
import { addedLines, contextRows, diffLines, diffStats, splitLines } from "../../src/observe/diff.ts";

const file = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`);

describe("AC2 diff with context", () => {
	test("diffLines numbers old and new lines and keeps order", () => {
		const ops = diffLines(["a", "b", "c"], ["a", "B", "c", "d"]);
		expect(ops).toEqual([
			{ kind: "eq", text: "a", oldNo: 1, newNo: 1 },
			{ kind: "del", text: "b", oldNo: 2, newNo: null },
			{ kind: "add", text: "B", oldNo: null, newNo: 2 },
			{ kind: "eq", text: "c", oldNo: 3, newNo: 3 },
			{ kind: "add", text: "d", oldNo: null, newNo: 4 },
		]);
		expect(diffStats(ops)).toEqual({ added: 2, removed: 1 });
	});

	test("contextRows keeps 3 lines around each change and folds the rest into gaps", () => {
		const after = file(20);
		after[9] = "changed";
		const rows = contextRows(diffLines(file(20), after));
		expect(rows[0]).toEqual({ kind: "gap", skipped: 6 });
		expect(rows.slice(1, 4).map((r) => (r.kind === "gap" ? "gap" : r.newNo))).toEqual([7, 8, 9]);
		expect(rows.filter((r) => r.kind === "del" || r.kind === "add").map((r) => r.kind)).toEqual(["del", "add"]);
		expect(rows.at(-1)).toEqual({ kind: "gap", skipped: 7 });
	});

	test("a file without changes shows every line", () => {
		const rows = contextRows(diffLines(file(10), file(10)));
		expect(rows).toHaveLength(10);
		expect(rows.every((r) => r.kind === "eq")).toBe(true);
	});

	test("a new file is all additions", () => {
		expect(diffStats(diffLines([], ["x", "y"]))).toEqual({ added: 2, removed: 0 });
	});

	test("big rewrites stay fast and correct in the counts", () => {
		const a = Array.from({ length: 6000 }, (_, i) => `a${i}`);
		const b = Array.from({ length: 6000 }, (_, i) => `b${i}`);
		const started = performance.now();
		expect(diffStats(diffLines(a, b))).toEqual({ added: 6000, removed: 6000 });
		expect(performance.now() - started).toBeLessThan(500);
	});

	test("splitLines ignores the final newline", () => {
		expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
		expect(splitLines("")).toEqual([]);
		expect(splitLines(null)).toEqual([]);
	});

	test("addedLines reads the new-file line numbers of + lines in a structuredPatch", () => {
		const hunks = [{ oldStart: 4, oldLines: 3, newStart: 4, newLines: 4, lines: [" x", "-y", "+Y", "+Z", " w"] }];
		expect(addedLines(hunks)).toEqual([5, 6]);
	});
});
