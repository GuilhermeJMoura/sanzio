import { open, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { JsonObject } from "$types/json.ts";
import type { SessionInfo, SessionState, WatchSessionOptions } from "$types/session.ts";

// The transcript format is undocumented and changes between Claude Code releases:
// read only the few fields we need and skip anything that does not look as expected.

const STATE_LABELS: Record<SessionState, string> = { working: "trabalhando", idle: "ocioso" };
const CHUNK_BYTES = 256 * 1024;
// a pasted image puts megabytes of base64 in one line; stop looking for an assistant line after this
const MAX_TAIL_BYTES = 8 * 1024 * 1024;
const ASSISTANT_MARK = '"type":"assistant"';
const POLL_MS = 1000;

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function projectSlug(cwd: string): string {
	return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

const configDirOf = (env: Record<string, string | undefined>) => env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");

export function projectDir(cwd: string, env: Record<string, string | undefined> = process.env): string {
	return join(configDirOf(env), "projects", projectSlug(cwd));
}

export function formatModel(id: string): string {
	const current = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[.*\])?$/.exec(id);
	if (current?.[1] && current[2]) {
		return `${capitalize(current[1])} ${current[2]}${current[3] ? `.${current[3]}` : ""}`;
	}
	const legacy = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)/.exec(id);
	if (legacy?.[1] && legacy[3]) {
		return `${capitalize(legacy[3])} ${legacy[1]}${legacy[2] ? `.${legacy[2]}` : ""}`;
	}
	return id;
}

export function formatTitle(info: SessionInfo): string {
	const parts = ["claude", info.model, info.effort, info.state ? STATE_LABELS[info.state] : null];
	return ` ${parts.filter((p): p is string => p !== null).join(" · ")} `;
}

function userText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block) => (isObject(block) ? (asString(block.text) ?? "") : "")).join("\n");
}

function isToolResult(content: unknown): boolean {
	return Array.isArray(content) && content.some((block) => isObject(block) && block.type === "tool_result");
}

function userState(entry: JsonObject, message: JsonObject): SessionState | null {
	if (entry.isMeta === true) return null;
	if (isToolResult(message.content)) return "working";
	const text = userText(message.content);
	if (text.startsWith("[Request interrupted")) return "idle";
	if (/<(command-name|local-command-stdout|local-command-caveat)>/.test(text)) return null;
	return text.length > 0 ? "working" : null;
}

/** A read that found nothing (e.g. only part of a huge line) keeps what we already knew. */
export function mergeSessionInfo(previous: SessionInfo, next: SessionInfo): SessionInfo {
	return {
		model: next.model ?? previous.model,
		effort: next.effort ?? previous.effort,
		state: next.state ?? previous.state,
	};
}

export function parseTranscript(text: string): SessionInfo {
	const info: SessionInfo = { model: null, effort: null, state: null };
	for (const line of text.split("\n")) {
		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isObject(entry) || entry.isSidechain === true || !isObject(entry.message)) continue;
		const message = entry.message;

		if (entry.type === "assistant") {
			const model = asString(message.model);
			if (model && !model.startsWith("<")) info.model = formatModel(model);
			info.effort = asString(entry.perTurnEffort) ?? asString(entry.effort) ?? info.effort;
			info.state = message.stop_reason === "end_turn" ? "idle" : "working";
		} else if (entry.type === "user") {
			info.state = userState(entry, message) ?? info.state;
		}
	}
	return info;
}

// drops the first line when the read started in the middle of it
const completeLines = (buffer: Buffer, start: number) =>
	start === 0 ? buffer : buffer.subarray(buffer.indexOf(0x0a) + 1);

/** Reads the end of a transcript backwards, chunk by chunk, until it holds a whole assistant line. */
async function readTail(file: string): Promise<string> {
	const handle = await open(file, "r");
	try {
		const { size } = await handle.stat();
		let start = size;
		let tail = Buffer.alloc(0);
		while (start > 0 && size - start < MAX_TAIL_BYTES) {
			const next = Math.max(0, start - CHUNK_BYTES);
			const chunk = Buffer.alloc(start - next);
			await handle.read(chunk, 0, chunk.length, next);
			tail = Buffer.concat([chunk, tail]);
			start = next;
			if (completeLines(tail, start).includes(ASSISTANT_MARK)) break;
		}
		return completeLines(tail, start).toString("utf8");
	} finally {
		await handle.close();
	}
}

/** The transcript of the claude process `pid`, from `<config>/sessions/<pid>.json`; null when that file is missing. */
async function sessionTranscript(configDir: string, pid: number): Promise<string | null> {
	let data: unknown;
	try {
		data = JSON.parse(await readFile(join(configDir, "sessions", `${pid}.json`), "utf8"));
	} catch {
		return null;
	}
	if (!isObject(data)) return null;
	const sessionId = asString(data.sessionId);
	const cwd = asString(data.cwd);
	if (!sessionId || !cwd || !/^[\w-]+$/.test(sessionId)) return null;
	return join(configDir, "projects", projectSlug(cwd), `${sessionId}.jsonl`);
}

async function newestTranscript(dir: string, since: number): Promise<string | null> {
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return null;
	}
	let newest: { file: string; mtime: number } | null = null;
	for (const name of names) {
		if (!name.endsWith(".jsonl")) continue;
		const file = join(dir, name);
		const mtime = await stat(file).then(
			(s) => s.mtimeMs,
			() => 0,
		);
		if (mtime >= since && (!newest || mtime > newest.mtime)) newest = { file, mtime };
	}
	return newest?.file ?? null;
}

/** Polls the transcript of claude process `pid` and reports changes; returns a stop function. */
export function watchSession(
	{ cwd, pid, since, env = process.env }: WatchSessionOptions,
	onChange: (info: SessionInfo) => void,
): () => void {
	const configDir = configDirOf(env);
	let info: SessionInfo = { model: null, effort: null, state: null };
	let lastKey = "";
	let busy = false;
	const tick = async () => {
		if (busy) return;
		busy = true;
		try {
			// fall back to the newest transcript only while claude has not written its pid file
			const file = (await sessionTranscript(configDir, pid)) ?? (await newestTranscript(projectDir(cwd, env), since));
			if (!file) return;
			const { mtimeMs, size } = await stat(file);
			const key = `${file}:${mtimeMs}:${size}`;
			if (key === lastKey) return;
			lastKey = key;
			info = mergeSessionInfo(info, parseTranscript(await readTail(file)));
			onChange(info);
		} catch {
			// a transcript we cannot read leaves the title as it was
		} finally {
			busy = false;
		}
	};
	const timer = setInterval(tick, POLL_MS);
	void tick();
	return () => clearInterval(timer);
}
