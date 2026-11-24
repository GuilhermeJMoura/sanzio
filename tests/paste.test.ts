import { afterEach, describe, expect, test } from "bun:test";
import type { SanzioRun } from "$types/testing.ts";
import { startReady, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

describe("AC3 pasting an image or dropping a file reaches claude intact", () => {
	test("a dropped file path arrives as the same bracketed paste", async () => {
		run = await startReady({ cwd: tempDir("sanzio-paste-") });
		const path = "/Users/someone/Desktop/Screen Shot 2026-11-23 at 10.00.00.png";
		const r = run;
		r.write(`\x1b[200~${path}\x1b[201~`);
		await r.waitFor(() => r.inputs().includes("\x1b[201~"), "paste end");
		expect(r.inputs()).toBe(`\x1b[200~${path}\x1b[201~`);
	});

	test("ctrl+v reaches claude so it can read the image from the clipboard", async () => {
		run = await startReady({ cwd: tempDir("sanzio-paste-") });
		const r = run;
		r.write("\x16");
		await r.waitFor(() => r.inputs().length > 0, "ctrl+v");
		expect(r.inputs()).toBe("\x1b[118;5u");
	});
});
