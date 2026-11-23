import { afterEach, describe, expect, test } from "bun:test";
import type { PhdtermRun } from "$types/testing.ts";
import { startReady } from "./helpers/pty.ts";
import { gitRepo } from "./helpers/repo.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

const COLS = 140;
const ROWS = 36;
const EXPLORER = 31; // paneSizes(140, 36)

/** Clicks (1-based SGR) the first cell of `text` on screen, searching only the given column range. */
async function click(r: PhdtermRun, text: string, fromCol = 0, toCol = COLS) {
	// like a person, click a frame after it shows: hit-testing settles a moment after the paint reaches the host
	await Bun.sleep(150);
	const lines = (await r.screen()).split("\n");
	const row = lines.findIndex((l) => l.slice(fromCol, toCol).includes(text));
	if (row < 0) throw new Error(`"${text}" not on screen`);
	const col = (lines[row] ?? "").indexOf(text, fromCol);
	r.write(`\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`);
}

const lineWith = (screen: string, text: string) => screen.split("\n").find((l) => l.includes(text)) ?? "";
const statusLine = (screen: string) => screen.split("\n").at(-1) ?? "";
const editorTitle = (path: string) => (s: string) => s.includes(`╭─ ${path} `);

async function workspace() {
	const r = await startReady({ cwd: gitRepo(), cols: COLS, rows: ROWS });
	await Bun.sleep(200);
	await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;" });
	await r.waitForScreen(editorTitle("src/a.ts"), "workspace on src/a.ts");
	return r;
}

describe("AC3 explorer: 'claude editou' newest first with +/− and age; tree marks M / U", () => {
	test("each claude edit is listed with its stats; the tree shows M and U", async () => {
		run = await workspace();
		const r = run;
		await r.claude({ op: "write", file: "src/token.ts", content: "export const t = 1;\nexport const u = 2;\n" });
		const explorer = (x: string) => x.split("\n").map((l) => l.slice(0, EXPLORER));
		const listed = (x: string) => {
			const rows = explorer(x);
			const at = rows.findIndex((l) => l.includes("claude editou"));
			return [rows[at] ?? "", rows[at + 1] ?? "", rows[at + 2] ?? ""];
		};
		// whole state in one predicate, so a failure prints the screen
		await r.waitForScreen((x) => {
			const [header = "", first = "", second = ""] = listed(x);
			return (
				/claude editou ─+ 2/.test(header) &&
				/token\.ts src\s+\+2 −0\s+(agora|\d+s)/.test(first) &&
				/a\.ts src\s+\+1 −1\s+(agora|\d+s)/.test(second) &&
				explorer(x).some((l) => /◆ a\.ts\s+M/.test(l)) &&
				explorer(x).some((l) => /◆ token\.ts\s+(● )?U/.test(l))
			);
		}, "claude editou list and M / U marks");
	});
});

describe("AC4 opening another file pauses follow; f resumes on the last edit", () => {
	test("a click on a tree file opens it and pauses; f jumps back to claude's file", async () => {
		run = await workspace();
		const r = run;
		await click(r, "config.json", 0, EXPLORER);
		let s = await r.waitForScreen(
			(x) => editorTitle("config.json")(x) && statusLine(x).startsWith(" PAUSADO "),
			"config.json open, paused",
		);
		expect(lineWith(s, "╭─ config.json")).toContain("◌ seguir pausado · f");

		r.write("f");
		s = await r.waitForScreen(
			(x) => editorTitle("src/a.ts")(x) && statusLine(x).startsWith(" SEGUINDO "),
			"back on src/a.ts, following",
		);
		expect(lineWith(s, "╭─ src/a.ts")).toContain("● seguindo o claude");
	});

	test("enter on the explorer's cursor opens that file and pauses", async () => {
		run = await workspace();
		const r = run;
		await click(r, "claude editou", 0, EXPLORER);
		r.write("\x1b[B\x1b[B\x1b[B\x1b[B\r"); // past a.ts in "claude editou", src/, .gitignore, onto config.json
		await r.waitForScreen((x) => editorTitle("config.json")(x) && statusLine(x).startsWith(" PAUSADO "), "paused");
	});
});

describe("AC5 paused, an edit raises 'o claude editou X' with abrir / ignorar", () => {
	test("ignorar drops the notice and stays; abrir opens the edited file", async () => {
		run = await workspace();
		const r = run;
		await click(r, "config.json", 0, EXPLORER);
		await r.waitForScreen(editorTitle("config.json"), "paused on config.json");

		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 2;", new: "export const a = 3;" });
		let s = await r.waitForScreen((x) => x.includes("o claude editou src/a.ts"), "notice");
		expect(lineWith(s, "o claude editou")).toMatch(/abrir\s+ignorar/);
		expect(s).toContain("╭─ config.json");

		await click(r, "ignorar");
		s = await r.waitForScreen((x) => !x.includes("o claude editou"), "notice gone");
		expect(s).toContain("╭─ config.json");

		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 3;", new: "export const a = 4;" });
		await r.waitForScreen((x) => x.includes("o claude editou src/a.ts"), "notice again");
		await click(r, "abrir");
		s = await r.waitForScreen(editorTitle("src/a.ts"), "abrir opened src/a.ts");
		expect(s).not.toContain("o claude editou");
	});
});

describe("AC6 ctrl+e hides and shows explorer and editor; the manual choice beats the automatic one", () => {
	test("hidden by ctrl+e, a new edit keeps it hidden; the status line hint brings it back", async () => {
		run = await workspace();
		const r = run;
		await click(r, "claude editou", 0, EXPLORER);
		r.write("\x05");
		await r.waitForScreen((s) => !s.includes("╭─ explorer") && s.includes("editor escondido"), "hidden");

		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 2;", new: "export const a = 5;" });
		await Bun.sleep(300);
		expect(await r.screen()).not.toContain("╭─ explorer");

		await click(r, "ctrl+e", 0, COLS);
		await r.waitForScreen((s) => s.includes("╭─ explorer"), "shown again");
	});
});

describe("AC8 status line", () => {
	test("SEGUINDO, branch, what claude is on, +/− · files and the shortcuts", async () => {
		const r = await startReady({ cwd: gitRepo(), cols: COLS, rows: ROWS });
		run = r;
		expect(statusLine(await r.waitForScreen((s) => s.includes("SEGUINDO"), "status"))).toMatch(
			/^ SEGUINDO {2}⎇ feat\/sessions {2}claude ocioso .* \+0 −0 · 0 arq {2}modo conversa · editor abre na 1ª edição · ctrl\+e editor · f seguir\s*$/,
		);
		await Bun.sleep(200);
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;\n// two" });
		const s = await r.waitForScreen(
			(x) => statusLine(x).includes("claude em src/a.ts") && statusLine(x).includes("+2 −1"),
			"claude em",
		);
		expect(statusLine(s)).toMatch(
			/^ SEGUINDO {2}⎇ feat\/sessions {2}claude em src\/a\.ts .* \+2 −1 · 1 arq {2}ctrl\+e editor · f seguir\s*$/,
		);
	});
});
