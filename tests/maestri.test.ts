import { afterEach, describe, expect, test } from "bun:test";
import type { SanzioRun } from "$types/testing.ts";
import { rewriteResumeHint } from "../src/claude-pane.ts";
import { FAKE_BIN, startReady, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

const maestriEnv = {
	MAESTRI_CLI: "/Applications/Maestri.app/Contents/MacOS/maestri",
	MAESTRI_SOCKET: "/tmp/maestri.sock",
	MAESTRI_TERMINAL_ID: "term-42",
};

describe("AC6 Maestri env and resume line", () => {
	test("MAESTRI_* and PATH reach claude unchanged, args pass through", async () => {
		const path = `${FAKE_BIN}:/opt/maestri/bin:${process.env.PATH ?? ""}`;
		run = await startReady({ cwd: tempDir("sanzio-env-"), env: maestriEnv, path, args: ["--resume", "abc-123"] });
		const start = run.records().find((r) => r.event === "start");
		expect(start?.env).toMatchObject({ ...maestriEnv, PATH: path });
		// sanzio's own --settings (the follow hooks) comes first, then the user's args untouched
		expect(start?.argv?.[0]).toBe("--settings");
		expect(start?.argv?.slice(2)).toEqual(["--resume", "abc-123"]);
	});

	test("on exit the resume line is printed as sanzio --resume <id>", async () => {
		const id = "5f0c2a1e-1111-4222-8333-944455556666";
		run = await startReady({ cwd: tempDir("sanzio-resume-"), env: { FAKE_CLAUDE_SESSION: id } });
		run.write("/exit");
		expect(await run.exited).toBe(0);
		const afterRestore = run.output().slice(run.output().lastIndexOf("\x1b[?1049l")).replaceAll("\r\n", "\n");
		expect(afterRestore).toContain(`Resume this session with:\nsanzio --resume ${id}\n`);
		expect(afterRestore).not.toContain("claude --resume");
	});

	test("rewriteResumeHint keeps the command and swaps only the program", () => {
		const out = "\x1b[2m\r\nResume this session with:\r\ncd /tmp/wt && claude --resume abc --model opus\r\n\x1b[22m";
		expect(rewriteResumeHint(out)).toBe("Resume this session with:\ncd /tmp/wt && sanzio --resume abc --model opus\n");
		expect(rewriteResumeHint("bye\n")).toBeNull();
	});
});
