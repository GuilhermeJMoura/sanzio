import { describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionInfo } from "$types/session.ts";
import { mergeSessionInfo, projectSlug, watchSession } from "../src/session-info.ts";
import { tempDir } from "./helpers/pty.ts";

const assistant = (model: string, effort: string, stop: string) =>
	`${JSON.stringify({ type: "assistant", perTurnEffort: effort, message: { model, stop_reason: stop } })}\n`;

function setup() {
	const configDir = tempDir("phdterm-config-");
	const cwd = tempDir("phdterm-cwd-");
	const projects = join(configDir, "projects", projectSlug(cwd));
	mkdirSync(projects, { recursive: true });
	mkdirSync(join(configDir, "sessions"), { recursive: true });
	return { configDir, cwd, transcript: (id: string) => join(projects, `${id}.jsonl`) };
}

async function firstInfo(
	options: Parameters<typeof watchSession>[0],
	until: (info: SessionInfo) => boolean,
): Promise<SessionInfo> {
	let latest: SessionInfo | null = null;
	const stop = watchSession(options, (info) => {
		latest = info;
	});
	try {
		const deadline = Date.now() + 5000;
		while (!(latest && until(latest)) && Date.now() < deadline) await Bun.sleep(25);
		return latest ?? { model: null, effort: null, state: null };
	} finally {
		stop();
	}
}

describe("AC8 the title follows claude's own session", () => {
	test("reads the transcript named in sessions/<pid>.json, not the newest one in the folder", async () => {
		const { configDir, cwd, transcript } = setup();
		writeFileSync(transcript("mine"), assistant("claude-opus-5-5", "high", "end_turn"));
		writeFileSync(transcript("other"), assistant("claude-haiku-4-5", "low", "tool_use"));
		const past = new Date(Date.now() + 1000);
		utimesSync(transcript("other"), past, past);
		writeFileSync(join(configDir, "sessions", "4242.json"), JSON.stringify({ pid: 4242, sessionId: "mine", cwd }));

		const info = await firstInfo(
			{ cwd, pid: 4242, since: 0, env: { CLAUDE_CONFIG_DIR: configDir } },
			(i) => i.model !== null,
		);
		expect(info).toEqual({ model: "Opus 5.5", effort: "high", state: "idle" });
	});

	test("a pasted image line bigger than the read window keeps model and effort", async () => {
		const { configDir, cwd, transcript } = setup();
		const image = { type: "image", source: { type: "base64", data: "A".repeat(700 * 1024) } };
		writeFileSync(transcript("big"), assistant("claude-opus-5-5", "high", "end_turn"));
		appendFileSync(
			transcript("big"),
			`${JSON.stringify({ type: "user", message: { content: [image, { type: "text", text: "what is this?" }] } })}\n`,
		);
		writeFileSync(join(configDir, "sessions", "77.json"), JSON.stringify({ pid: 77, sessionId: "big", cwd }));

		const info = await firstInfo(
			{ cwd, pid: 77, since: 0, env: { CLAUDE_CONFIG_DIR: configDir } },
			(i) => i.model !== null,
		);
		expect(info).toEqual({ model: "Opus 5.5", effort: "high", state: "working" });
	});

	test("a read with no data never wipes the last known values", () => {
		const known: SessionInfo = { model: "Opus 5.5", effort: "high", state: "working" };
		expect(mergeSessionInfo(known, { model: null, effort: null, state: null })).toEqual(known);
		expect(mergeSessionInfo(known, { model: null, effort: null, state: "idle" })).toEqual({ ...known, state: "idle" });
	});
});
