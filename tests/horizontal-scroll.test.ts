import { afterEach, describe, expect, test } from "bun:test";
import type { SanzioRun } from "$types/testing.ts";
import { KEY, openNotes } from "./helpers/edit.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

/** 160 columns of `.........0.........1…` then TAILEND: the visible slice tells the column. */
const LONG = `${Array.from({ length: 16 }, (_, i) => `${i}`.padStart(10, ".")).join("")}TAILEND`;
const NOTES = `alpha\n${LONG}\ngamma\n${Array.from({ length: 40 }, (_, i) => `row${i}`).join("\n")}\n`;

/** The screen line holding the long line. */
async function longRow(r: SanzioRun): Promise<string> {
	return (await r.screen()).split("\n").find((line) => /\.{9}\d|TAILEND/.test(line)) ?? "";
}

/** SGR wheel `button` (64/65 up/down, 66/67 left/right, +4 with shift) at the cell of the first `text` on screen. */
async function wheel(r: SanzioRun, button: number, text: string, times = 1): Promise<void> {
	const lines = (await r.screen()).split("\n");
	const row = lines.findIndex((line) => line.includes(text));
	if (row < 0) throw new Error(`${text} not on screen:\n${lines.join("\n")}`);
	const col = (lines[row] ?? "").indexOf(text);
	for (let i = 0; i < times; i++) {
		r.write(`\x1b[<${button};${col + 1};${row + 1}M`);
		await Bun.sleep(10);
	}
}

async function press(r: SanzioRun, key: string, times: number): Promise<void> {
	for (let i = 0; i < times; i++) {
		r.write(key);
		await Bun.sleep(10);
	}
}

const atStart = (row: string) => row.includes(".........0") && !row.includes("TAILEND");
const atEnd = (row: string) => /TAILEND│/.test(row);

describe("AC1 → / ← scroll the focused viewer sideways, within the longest line", () => {
	test("→ shows the end of the line and stops there; ← comes back and stops at column 0", async () => {
		run = await openNotes(NOTES);
		const r = run;
		await r.click("alpha");
		await Bun.sleep(100);
		await press(r, KEY.right, 60); // 240 columns asked, 160 + TAILEND there
		await r.waitForScreen((s) => s.includes("TAILEND"), "the end of the long line");
		await Bun.sleep(150);
		expect(atEnd(await longRow(r))).toBe(true); // TAILEND against the border, no blank past it
		await press(r, KEY.left, 80);
		await r.waitForScreen((s) => s.includes("alpha"), "column 0");
		expect(atStart(await longRow(r))).toBe(true);
	});
});

describe("AC2 / AC3 the wheel scrolls the editor sideways (SGR mouse in a PTY)", () => {
	test("horizontal wheel (buttons 66/67) over the text moves the view right and back", async () => {
		run = await openNotes(NOTES);
		const r = run;
		await wheel(r, 67, "row3", 120);
		await r.waitForScreen((s) => s.includes("TAILEND"), "the end of the long line");
		await wheel(r, 66, "TAILEND", 200);
		await r.waitForScreen((s) => s.includes("alpha") && s.includes(".........0"), "back at column 0");
	});

	test("shift + vertical wheel moves sideways, not up or down", async () => {
		run = await openNotes(NOTES);
		const r = run;
		await wheel(r, 69, "row3", 120); // shift + wheel down
		const screen = await r.waitForScreen((s) => s.includes("TAILEND"), "the end of the long line");
		expect(screen).toMatch(/│\s+1\s/); // line 1 still at the top: no vertical scroll
	});

	test("the wheel over the line numbers scrolls the text too", async () => {
		run = await openNotes(NOTES);
		const r = run;
		const lines = (await r.screen()).split("\n");
		const row = lines.findIndex((line) => line.includes(".........0"));
		const col = (lines[row] ?? "").search(/\s2\s/) + 1;
		for (let i = 0; i < 120; i++) r.write(`\x1b[<67;${col + 1};${row + 1}M`);
		await r.waitForScreen((s) => s.includes("TAILEND"), "the end of the long line");
	});
});

/** The two halves' slices of the long line in the side by side view. */
function halves(screen: string): [string, string] {
	const line = screen.split("\n").find((l) => /\s2\s.*\s2\s/.test(l)) ?? "";
	const m = line.match(/\s2\s+(\S+)\s+2\s+(\S+)/);
	return [m?.[1] ?? "", m?.[2] ?? ""];
}

describe("AC4 side by side: both halves scroll together, at the same column", () => {
	test("→ and the wheel over one half move both", async () => {
		run = await openNotes(NOTES);
		const r = run;
		await r.click("alpha");
		await Bun.sleep(100);
		r.write("v");
		await Bun.sleep(100);
		r.write("v");
		await r.waitForScreen((s) => halves(s)[0] !== "", "side by side");

		await press(r, KEY.right, 3);
		let screen = await r.waitForScreen((s) => halves(s)[0].startsWith(".......1"), "both halves at column 12");
		expect(halves(screen)[1].slice(0, 20)).toBe(halves(screen)[0].slice(0, 20));

		await wheel(r, 67, ".......1", 5); // over the left half
		screen = await r.waitForScreen((s) => halves(s)[0].startsWith("..1"), "left half at column 17");
		await Bun.sleep(150);
		screen = await r.screen();
		expect(halves(screen)[1].slice(0, 20)).toBe(halves(screen)[0].slice(0, 20));
	});
});

describe("AC6 scrolled sideways, the gutter stays put", () => {
	test("line numbers and the + sign stay at the left; ◂ claude rides at the end of its line", async () => {
		run = await openNotes(NOTES);
		const r = run;
		await r.claude({
			op: "edit",
			file: "notes.txt",
			old: "gamma",
			new: `gamma ${LONG}END2`,
		});
		await r.waitForScreen((s) => /\s3 \+ gamma \./.test(s), "claude's edit, its ◂ claude past the right edge");
		await r.click("alpha");
		await Bun.sleep(100);
		await press(r, KEY.right, 50);
		const screen = await r.waitForScreen((s) => /END2\s+◂ claude/.test(s), "end of claude's line");
		expect(screen).toMatch(/│\s+3 \+ .*END2\s+◂ claude│/);
		expect(screen).toMatch(/│\s+2\s+\.*\d/);
	});
});
