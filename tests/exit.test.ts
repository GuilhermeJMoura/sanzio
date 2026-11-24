import { afterEach, describe, expect, test } from "bun:test";
import type { SanzioRun } from "$types/testing.ts";
import { startReady, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

describe("AC7 sanzio exits with claude's code and a clean terminal", () => {
	test("same exit code and every mode turned off after the last frame", async () => {
		run = await startReady({ cwd: tempDir("sanzio-exit-"), env: { FAKE_CLAUDE_EXIT: "3" } });
		run.write("/exit");
		expect(await run.exited).toBe(3);

		const out = run.output();
		const tail = out.slice(out.lastIndexOf("\x1b[?2026l"));
		for (const seq of [
			"\x1b[?1049l",
			"\x1b[?25h",
			"\x1b[?1000l",
			"\x1b[?1002l",
			"\x1b[?1003l",
			"\x1b[?1006l",
			"\x1b[?2004l",
			"\x1b[>4;0m",
		]) {
			expect(tail).toContain(seq);
		}
	});

	test("a host with the kitty keyboard protocol gets its keyboard mode popped", async () => {
		run = await startReady({ cwd: tempDir("sanzio-exit-"), kittyHost: true });
		run.write("/exit");
		expect(await run.exited).toBe(0);
		const out = run.output();
		expect(out).toContain("\x1b[>5u");
		expect(out.slice(out.lastIndexOf("\x1b[?2026l"))).toContain("\x1b[<u");
	});
});
