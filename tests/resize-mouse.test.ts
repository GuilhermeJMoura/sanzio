import { afterEach, describe, expect, test } from "bun:test";
import type { PhdtermRun } from "$types/testing.ts";
import { startReady, tempDir } from "./helpers/pty.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

describe("AC4 scroll and resize", () => {
	test("resizing the host terminal resizes claude's PTY to the pane's inner size", async () => {
		run = await startReady({ cwd: tempDir("phdterm-size-"), cols: 100, rows: 30 });
		const r = run;
		r.resize(140, 45);
		await r.waitFor(
			() => r.records().some((x) => x.event === "resize" && x.cols === 138 && x.rows === 43),
			"child resize",
		);
	});

	test("mouse wheel reaches claude as SGR mouse at pane-relative cells", async () => {
		run = await startReady({ cwd: tempDir("phdterm-mouse-") });
		const r = run;
		r.write("\x1b[<65;10;5M");
		await r.waitFor(() => r.inputs().includes("M"), "wheel");
		expect(r.inputs()).toBe("\x1b[<65;9;4M");
	});
});
