import { afterEach, describe, expect, test } from "bun:test";
import type { SanzioRun } from "$types/testing.ts";
import { startReady, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

async function send(r: SanzioRun, host: string, expected: string): Promise<void> {
	const before = r.inputs().length;
	r.write(host);
	await r.waitFor(
		() => r.inputs().length > before && r.inputs().slice(before).includes(expected),
		JSON.stringify(expected),
	);
	expect(r.inputs().slice(before)).toBe(expected);
}

// Expected bytes are what Ghostty (whose VT encoder sanzio embeds) sends to a program in that keyboard mode.
describe("AC2 Shift+Enter, Esc and Shift+Tab reach claude as in a plain terminal", () => {
	test("claude in kitty keyboard mode (CSI > 1 u) gets the kitty encodings", async () => {
		run = await startReady({ cwd: tempDir("sanzio-kbd-"), keyboard: "kitty" });
		await send(run, "\x1b[13;2u", "\x1b[13;2u");
		await send(run, "\x1b[27;2;13~", "\x1b[13;2u");
		await send(run, "\x1b[Z", "\x1b[9;2u");
		await send(run, "\x1b", "\x1b[27u");
	});

	test("claude in legacy mode with modifyOtherKeys 2 gets the xterm encodings", async () => {
		run = await startReady({ cwd: tempDir("sanzio-kbd-"), keyboard: "legacy" });
		await send(run, "\x1b[27;2;13~", "\x1b[27;2;13~");
		await send(run, "\x1b[Z", "\x1b[27;2;9~");
		await send(run, "\x1b", "\x1b");
	});
});
