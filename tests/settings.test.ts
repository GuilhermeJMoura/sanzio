import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhdtermRun } from "$types/testing.ts";
import { startPhdterm } from "./helpers/pty.ts";
import { gitRepo } from "./helpers/repo.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

const listAll = (dir: string): string[] =>
	existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).map(String).sort() : [];

describe("AC7 phdterm's hooks go in through --settings; the user's settings and hooks are left alone", () => {
	test("settings.json is untouched, no settings file is written, and the user's own hook still runs", async () => {
		const root = gitRepo();
		const scratch = join(root, "..", `${root.split("/").pop()}-home`);
		const configDir = join(scratch, "claude-config");
		mkdirSync(configDir, { recursive: true });
		const marker = join(scratch, "user-hook.jsonl");
		const settingsFile = join(configDir, "settings.json");
		const userSettings = `${JSON.stringify(
			{ hooks: { PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: `cat >> '${marker}'` }] }] } },
			null,
			2,
		)}\n`;
		writeFileSync(settingsFile, userSettings);
		const mtime = statSync(settingsFile).mtimeMs;
		const configBefore = listAll(configDir);

		run = startPhdterm({ cwd: root, cols: 120, rows: 34, env: { CLAUDE_CONFIG_DIR: configDir } });
		const r = run;
		await r.waitFor(() => r.records().some((x) => x.event === "start"), "fake claude start");
		await Bun.sleep(200);
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 9;" });

		// phdterm's http hook fired: the editor follows the edit
		await r.waitForScreen((s) => s.includes("╭─ src/a.ts"), "phdterm followed the edit");
		// the user's command hook fired too, with claude's payload
		const userHook = readFileSync(marker, "utf8");
		expect(JSON.parse(userHook.trim().split("\n")[0] ?? "{}")).toMatchObject({
			hook_event_name: "PostToolUse",
			tool_name: "Edit",
		});

		const argv = r.records().find((x) => x.event === "start")?.argv ?? [];
		expect(argv[0]).toBe("--settings");
		const passed = JSON.parse(argv[1] ?? "{}");
		expect(passed.hooks.PostToolUse[0].hooks[0].url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/hook$/);
		expect(argv.join(" ")).not.toMatch(/Bearer [0-9a-f-]{36}/);

		expect(readFileSync(settingsFile, "utf8")).toBe(userSettings);
		expect(statSync(settingsFile).mtimeMs).toBe(mtime);
		expect(listAll(configDir)).toEqual(configBefore);
		expect(existsSync(join(root, ".claude"))).toBe(false);
	});
});
