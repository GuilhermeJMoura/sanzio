import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SanzioRun } from "$types/testing.ts";
import { KEY, NOTES, type } from "./helpers/edit.ts";
import { startReady } from "./helpers/pty.ts";
import { git, gitRepo } from "./helpers/repo.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

const CTRL_O = "\x0f";

/** A repo with notes.txt, sanzio on it and the workspace shown by ctrl+e, claude still focused. */
async function shown(): Promise<SanzioRun> {
	const root = gitRepo();
	writeFileSync(join(root, "notes.txt"), `${NOTES}\n`);
	git(root, "add", ".");
	git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "notes");
	const r = await startReady({ cwd: root, cols: 120, rows: 34 });
	await Bun.sleep(200); // session-start snapshot and watcher
	r.write(KEY.ctrlE);
	await r.waitForScreen((s) => s.includes("╭─ explorer") && s.includes("notes.txt"), "workspace");
	return r;
}

/** `ch` typed now reaches claude: the focus is on the claude pane. */
async function claudeGets(r: SanzioRun, ch: string): Promise<void> {
	const before = r.inputs().length;
	r.write(ch);
	await r.waitFor(() => r.inputs().slice(before).includes(ch), `${ch} typed into claude`);
}

/** `ch` typed now never reaches claude. */
async function claudeMisses(r: SanzioRun, ch: string): Promise<void> {
	const before = r.inputs().length;
	r.write(ch);
	await Bun.sleep(200);
	expect(r.inputs().slice(before)).not.toContain(ch);
}

/** With the explorer focused, moves its cursor down until notes.txt opens in the editor. */
async function openNotesFromExplorer(r: SanzioRun): Promise<void> {
	for (let i = 0; i < 12; i++) {
		r.write(KEY.down);
		await Bun.sleep(30);
		r.write("\r");
		await Bun.sleep(120);
		if ((await r.screen()).includes("╭─ notes.txt")) return;
	}
	throw new Error(`notes.txt never opened from the explorer:\n${await r.screen()}`);
}

describe("AC1 / AC4 ctrl+o cycles claude → explorer → editor → claude, and each pane works as after a click", () => {
	test("explorer: arrows + enter open a file; editor: i, typing and ctrl+s save; back on claude keys reach it", async () => {
		run = await shown();
		const r = run;
		await claudeGets(r, "a");

		r.write(CTRL_O);
		await claudeMisses(r, "x"); // the explorer has it
		await openNotesFromExplorer(r);

		r.write(CTRL_O);
		await Bun.sleep(100);
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO from the editor focused by ctrl+o");
		await type(r, "K");
		await r.waitForScreen((s) => s.includes("EDITANDO ●"), "unsaved K");
		r.write(KEY.ctrlS);
		await r.waitForScreen((s) => s.includes("você editou") && !s.includes("EDITANDO ●"), "saved");
		expect(readFileSync(join(r.cwd, "notes.txt"), "utf8")).toBe(`K${NOTES}\n`);
		r.write(KEY.esc);
		await r.waitForScreen((s) => !s.includes("EDITANDO"), "edit mode left");

		r.write(CTRL_O);
		await Bun.sleep(100);
		await claudeGets(r, "b");
	});
});

describe("AC2 ctrl+o never reaches claude, whatever pane has the focus", () => {
	test("three ctrl+o around the cycle: claude got none of them", async () => {
		run = await shown();
		const r = run;
		const typed = r.inputs().length;
		for (let i = 0; i < 3; i++) {
			r.write(CTRL_O);
			await Bun.sleep(150);
		}
		await claudeGets(r, "z");
		expect(r.inputs().slice(typed)).toBe("z");
	});
});

describe("AC3 in conversation mode ctrl+o does nothing", () => {
	test("the focus stays on claude and claude never sees the byte", async () => {
		const r = await startReady({ cwd: gitRepo(), cols: 120, rows: 34 });
		run = r;
		await r.waitForScreen((s) => s.includes("modo conversa"), "conversation mode");
		const typed = r.inputs().length;
		r.write(CTRL_O);
		await Bun.sleep(200);
		await claudeGets(r, "q");
		expect(r.inputs().slice(typed)).toBe("q");
		const s = await r.screen();
		expect(s).not.toContain("╭─ explorer");
		expect(s).toContain("modo conversa");
	});
});

describe("AC5 ctrl+o away from an unsaved edit keeps it; back with ctrl+o the cursor is in the edit", () => {
	test("EDITANDO ● and the text stay while claude has the focus; around the cycle typing goes on", async () => {
		run = await shown();
		const r = run;
		r.write(CTRL_O);
		await Bun.sleep(100);
		await openNotesFromExplorer(r);
		r.write(CTRL_O);
		await Bun.sleep(100);
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO");
		await type(r, "M");
		await r.waitForScreen((s) => s.includes("EDITANDO ●") && /│\s+1\s+Malpha\s/.test(s), "unsaved M");

		r.write(CTRL_O); // editor → claude
		await Bun.sleep(150);
		await claudeGets(r, "c");
		let s = await r.screen();
		expect(s).toContain("EDITANDO ●");
		expect(s).toContain("╭─ notes.txt ●");
		expect(s).toMatch(/│\s+1\s+Malpha\s/);

		r.write(CTRL_O); // claude → explorer
		await Bun.sleep(100);
		r.write(CTRL_O); // explorer → editor, back in the edit
		await Bun.sleep(150);
		await type(r, "N");
		s = await r.waitForScreen((x) => /│\s+1\s+MNalpha\s/.test(x), "typing goes on where it was");
		expect(s).toContain("EDITANDO ●");
		expect(readFileSync(join(r.cwd, "notes.txt"), "utf8")).toBe(`${NOTES}\n`);
	});
});
