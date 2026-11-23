import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhdtermRun } from "$types/testing.ts";
import { startReady } from "./pty.ts";
import { git, gitRepo } from "./repo.ts";

export const KEY = {
	esc: "\x1b",
	ctrlS: "\x13",
	ctrlZ: "\x1a",
	ctrlY: "\x19",
	ctrlE: "\x05",
	left: "\x1b[D",
	right: "\x1b[C",
	up: "\x1b[A",
	down: "\x1b[B",
	home: "\x1b[H",
	end: "\x1b[F",
	backspace: "\x7f",
} as const;

export const NOTES = ["alpha", "beta", "gamma", "delta"].join("\n");

/** A repo with notes.txt (4 lines unless told), phdterm on it, the workspace shown and notes.txt open in the viewer. */
export async function openNotes(notes = `${NOTES}\n`, cols = 120, rows = 34): Promise<PhdtermRun> {
	const root = gitRepo();
	writeFileSync(join(root, "notes.txt"), notes);
	git(root, "add", ".");
	git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "notes");
	const r = await startReady({ cwd: root, cols, rows });
	await Bun.sleep(200); // session-start snapshot and watcher
	r.write(KEY.ctrlE);
	await r.waitForScreen((s) => s.includes("╭─ explorer"), "workspace");
	await Bun.sleep(150); // hit-testing settles a moment after the paint reaches the host
	await r.click(/notes\.txt/);
	await r.waitForScreen((s) => s.includes("╭─ notes.txt"), "notes.txt open");
	return r;
}

/** Focuses the editor (one click on its text) and presses i. */
export async function startEditing(r: PhdtermRun): Promise<void> {
	await r.click("gamma");
	await Bun.sleep(100);
	r.write("i");
	await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO");
}

/** Types `text` one key at a time, the way a person does. */
export async function type(r: PhdtermRun, text: string): Promise<void> {
	for (const ch of text) {
		r.write(ch);
		await Bun.sleep(15);
	}
}
