import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SanzioRun } from "$types/testing.ts";
import { projectSlug } from "../src/session-info.ts";
import { startReady } from "./helpers/pty.ts";
import { gitRepo, sedInPlace } from "./helpers/repo.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

/** Runs a fake-claude tool call and returns how long the screen took to show it after the call returned. */
async function shownWithin(r: SanzioRun, act: () => Promise<void>, seen: (screen: string) => boolean, label: string) {
	await act();
	const started = performance.now();
	await r.waitForScreen(seen, label, 3000);
	return performance.now() - started;
}

const start = async (cols = 120) => {
	const r = await startReady({ cwd: gitRepo(), cols, rows: 34 });
	await Bun.sleep(200); // session-start snapshot and watcher
	return r;
};

describe("AC1 conversation mode, then the workspace on the first edit (PTY, fake claude firing hooks)", () => {
	test("only claude at first; claude's first Edit brings the explorer and the editor on that file", async () => {
		run = await start();
		const r = run;
		const before = await r.screen();
		expect(before).not.toContain("explorer");
		expect(before).toContain("modo conversa");

		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;" });
		const after = await r.waitForScreen((s) => s.includes("╭─ explorer"), "workspace");
		expect(after).toContain("╭─ src/a.ts");
		expect(after).toContain("claude editou");
		expect(after).not.toContain("modo conversa");
	});
});

describe("AC2 the editor follows each edit in under a second, ◂ claude on the new lines", () => {
	test("Edit (hook), Write (hook) and Bash sed -i (watcher) each open the file with the diff", async () => {
		run = await start();
		const r = run;

		const edit = await shownWithin(
			r,
			() => r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 7;" }),
			(s) => /− export const a = 1;/.test(s) && /\+ export const a = 7;\s+◂ claude/.test(s),
			"Edit diff",
		);
		expect(edit).toBeLessThan(1000);

		const write = await shownWithin(
			r,
			() => r.claude({ op: "write", file: "src/token.ts", content: "export const token = 'abc';\n" }),
			(s) => s.includes("╭─ src/token.ts") && /\+ export const token = 'abc';\s+◂ claude/.test(s),
			"Write diff",
		);
		expect(write).toBeLessThan(1000);

		const bash = await shownWithin(
			r,
			() => r.claude({ op: "bash", command: `${sedInPlace} s/3600/604800/ config.json` }),
			(s) => s.includes("╭─ config.json") && /\+ \{ "ttl": 604800 }\s+◂ claude/.test(s),
			"sed -i diff",
		);
		expect(bash).toBeLessThan(1000);
	});
});

describe("focus: f and ctrl+e belong to sanzio only outside the claude pane", () => {
	test("with claude focused, f goes to claude; after a click on the explorer it pauses follow instead", async () => {
		run = await start();
		const r = run;
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 3;" });
		await r.waitForScreen((s) => s.includes("╭─ explorer"), "workspace");

		r.write("f");
		await r.waitFor(() => r.inputs().includes("f"), "f typed into claude");

		await Bun.sleep(150); // hit-testing settles a moment after the paint reaches the host
		r.write("\x1b[<0;5;10M\x1b[<0;5;10m");
		await Bun.sleep(150);
		const typed = r.inputs().length;
		r.write("f");
		await r.waitForScreen((s) => s.includes("PAUSADO"), "PAUSADO");
		r.write("\x05"); // ctrl+e
		await r.waitForScreen((s) => !s.includes("╭─ explorer") && s.includes("editor escondido"), "workspace hidden");
		expect(r.inputs().length).toBe(typed);
	});
});

describe("a tool call that never finishes does not keep claude busy", () => {
	test("Pre with no Post, then claude goes idle: the user's own save is not claude's and the status is idle", async () => {
		run = await start(160); // wide enough for "claude em" beside the conversation-mode hints
		const r = run;
		await r.claude({ op: "edit-interrupted", file: "src/a.ts" });
		await r.waitForScreen((s) => s.includes("claude em src/a.ts"), "claude on src/a.ts");

		// esc: claude writes the interruption and stops
		const dir = join(r.configDir, "projects", projectSlug(r.cwd));
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "5f0c2a1e-1111-4222-8333-944455556666.jsonl"),
			`${JSON.stringify({ type: "user", message: { content: "[Request interrupted by user]" } })}\n`,
		);
		await r.waitForScreen((s) => s.includes("claude ocioso"), "claude idle", 4000);

		writeFileSync(join(r.cwd, "config.json"), '{ "ttl": 1 }\n');
		await Bun.sleep(800);
		const s = await r.screen();
		expect(s).toContain("claude ocioso");
		expect(s).toContain("+0 −0 · 0 arq");
		expect(s).not.toContain("╭─ explorer");
	});
});
