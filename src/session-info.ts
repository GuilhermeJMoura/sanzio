import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionInfo, SessionState } from "$types/session.ts";

// The transcript format is undocumented and changes between Claude Code releases:
// read only the few fields we need and skip anything that does not look as expected.

const STATE_LABELS: Record<SessionState, string> = { working: "trabalhando", idle: "ocioso" };
const TAIL_BYTES = 256 * 1024;
const POLL_MS = 1000;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
	typeof value === "object" && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export function projectSlug(cwd: string): string {
	return cwd.replace(/[^A-Za-z0-9]/g, "-");
}

export function projectDir(cwd: string, env: Record<string, string | undefined> = process.env): string {
	const configDir = env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
	return join(configDir, "projects", projectSlug(cwd));
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

async function readTail(file: string): Promise<string> {
	const handle = await open(file, "r");
	try {
		const { size } = await handle.stat();
		const start = Math.max(0, size - TAIL_BYTES);
		const buffer = Buffer.alloc(size - start);
		await handle.read(buffer, 0, buffer.length, start);
		const text = buffer.toString("utf8");
		// drop the first line when we started in the middle of it
		return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
	} finally {
		await handle.close();
	}
}

async function newestTranscript(dir: string, since: number): Promise<{ file: string; mtime: number } | null> {
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
	return newest;
}

/** Polls the newest transcript of `cwd` touched since `since` and reports changes; returns a stop function. */
export function watchSession(cwd: string, since: number, onChange: (info: SessionInfo) => void): () => void {
	const dir = projectDir(cwd);
	let lastKey = "";
	let busy = false;
	const tick = async () => {
		if (busy) return;
		busy = true;
		try {
			const newest = await newestTranscript(dir, since);
			if (!newest) return;
			const key = `${newest.file}:${newest.mtime}`;
			if (key === lastKey) return;
			lastKey = key;
			onChange(parseTranscript(await readTail(newest.file)));
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
