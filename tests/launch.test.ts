import { afterEach, describe, expect, test } from "bun:test";
import type { PhdtermRun } from "$types/testing.ts";
import { startPhdterm, startReady, tempDir } from "./helpers/pty.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

describe("AC1 phdterm opens the TUI with claude in the current folder", () => {
	test("claude runs in the caller's folder, inside the alt-screen, filling the pane", async () => {
		const folder = tempDir("phdterm-cwd-");
		run = await startReady({ cwd: folder, cols: 100, rows: 30 });

		const start = run.records().find((r) => r.event === "start");
		expect(start?.cwd).toBe(folder);
		expect(run.output()).toContain("\x1b[?1049h");
		// the rounded pane takes one cell on each side, the status line the last row
		expect(start?.cols).toBe(98);
		expect(start?.rows).toBe(27);
		expect(run.output()).toContain("╭");
	});

	test("without claude in PATH it exits non-zero with a clear message", async () => {
		run = startPhdterm({ cwd: tempDir("phdterm-cwd-"), path: "/usr/bin:/bin" });
		const code = await run.exited;
		expect(code).not.toBe(0);
		expect(run.output()).toContain("claude was not found in PATH");
		expect(run.output()).not.toContain("\x1b[?1049h");
	});
});
