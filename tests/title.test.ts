import { afterEach, describe, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhdtermRun } from "$types/testing.ts";
import { projectSlug } from "../src/session-info.ts";
import { startReady, tempDir } from "./helpers/pty.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

describe("AC8 the pane border follows the session transcript", () => {
	test("model, effort and state appear in the title while claude works, then idle", async () => {
		const folder = tempDir("phdterm-title-");
		run = await startReady({ cwd: folder });
		const r = run;
		const dir = join(r.configDir, "projects", projectSlug(folder));
		mkdirSync(dir, { recursive: true });
		const file = join(dir, "5f0c2a1e-1111-4222-8333-944455556666.jsonl");
		const assistant = (stop: string) =>
			JSON.stringify({
				type: "assistant",
				perTurnEffort: "high",
				message: { model: "claude-opus-5-5", stop_reason: stop },
			});

		writeFileSync(file, `${JSON.stringify({ type: "user", message: { content: "hi" } })}\n${assistant("tool_use")}\n`);
		await r.waitFor(() => r.output().includes("Opus 5.5 · high · trabalhando"), "working title");

		writeFileSync(file, `${assistant("end_turn")}\n`, { flag: "a" });
		await r.waitFor(() => r.output().includes("ocioso"), "idle title");
	});
});
