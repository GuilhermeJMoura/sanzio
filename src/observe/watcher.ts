import { type FSWatcher, watch } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { GitMark, RepoInfo, WatchTreeOptions } from "$types/observe.ts";

const ALWAYS_IGNORED = new Set([".git", "node_modules"]);
const MAX_FILE_BYTES = 1024 * 1024;
const DEBOUNCE_MS = 25;

function gitSync(cwd: string, args: string[]): string | null {
	const proc = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "ignore" });
	return proc.exitCode === 0 ? proc.stdout.toString() : null;
}

async function gitAsync(cwd: string, args: string[], stdin?: string): Promise<string> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
		stdout: "pipe",
		stderr: "ignore",
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
}

const nulList = (text: string) => text.split("\0").filter((s) => s.length > 0);
const isAlwaysIgnored = (path: string) => path.split("/").some((part) => ALWAYS_IGNORED.has(part));

export function repoInfo(cwd: string): RepoInfo {
	const top = gitSync(cwd, ["rev-parse", "--show-toplevel"])?.trim();
	return top ? { root: top, isGit: true } : { root: cwd, isGit: false };
}

export function gitBranch(root: string): string | null {
	const branch = gitSync(root, ["branch", "--show-current"])?.trim();
	if (branch) return branch;
	return gitSync(root, ["rev-parse", "--short", "HEAD"])?.trim() || null;
}

async function walk(root: string, dir = ""): Promise<string[]> {
	const entries = await readdir(join(root, dir), { withFileTypes: true }).catch(() => []);
	const files: string[] = [];
	for (const entry of entries) {
		if (ALWAYS_IGNORED.has(entry.name)) continue;
		const path = dir ? `${dir}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...(await walk(root, path)));
		else if (entry.isFile()) files.push(path);
	}
	return files;
}

/** Files of the tree, relative to the root: tracked and untracked minus gitignored, or the whole folder outside git. */
export async function listFiles({ root, isGit }: RepoInfo): Promise<string[]> {
	if (!isGit) return (await walk(root)).sort();
	const out = await gitAsync(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
	return [...new Set(nulList(out))].filter((p) => !isAlwaysIgnored(p)).sort();
}

/** M for modified (staged or not), U for files git does not track yet. */
export async function gitMarks(root: string): Promise<Map<string, GitMark>> {
	const entries = nulList(await gitAsync(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
	const marks = new Map<string, GitMark>();
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i] ?? "";
		const code = entry.slice(0, 2);
		const path = entry.slice(3);
		if (code.startsWith("R") || code.startsWith("C")) i++; // the original path follows
		if (code.includes("D")) continue;
		marks.set(path, code === "??" || code.startsWith("A") ? "U" : "M");
	}
	return marks;
}

/** Text content of a file, or null when it is missing, a folder, too big or binary. */
export async function readText(path: string): Promise<string | null> {
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
		const buffer = await readFile(path);
		return buffer.includes(0) ? null : buffer.toString("utf8");
	} catch {
		return null;
	}
}

/**
 * A file's text only when saving it back is lossless: strict UTF-8, no NUL, at most 1 MB; null otherwise.
 * readText's lenient decode would turn invalid bytes into U+FFFD and a save would write those.
 */
export async function readEditable(path: string): Promise<string | null> {
	try {
		const info = await stat(path);
		if (!info.isFile() || info.size > MAX_FILE_BYTES) return null;
		const buffer = await readFile(path);
		if (buffer.includes(0)) return null;
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buffer);
	} catch {
		return null;
	}
}

/** Session-start content of each file: the base every diff in this session is computed against. */
export async function readSnapshot(root: string, files: string[]): Promise<Map<string, string | null>> {
	const entries = await Promise.all(files.map(async (f) => [f, await readText(join(root, f))] as const));
	return new Map(entries);
}

async function dropGitIgnored(root: string, paths: string[]): Promise<string[]> {
	const ignored = new Set(nulList(await gitAsync(root, ["check-ignore", "-z", "--stdin"], `${paths.join("\0")}\0`)));
	return paths.filter((p) => !ignored.has(p));
}

/** Watches the tree (FSEvents on macOS) and reports changed paths in small batches; returns a stop function. */
export function watchTree({ root, isGit, onChange }: WatchTreeOptions): () => void {
	let pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let stopped = false;
	const flush = async () => {
		timer = null;
		const paths = [...pending];
		pending = new Set();
		const kept = isGit ? await dropGitIgnored(root, paths) : paths;
		if (!stopped && kept.length > 0) onChange(kept);
	};
	let watcher: FSWatcher | null = null;
	try {
		watcher = watch(root, { recursive: true }, (_event, name) => {
			if (!name) return;
			const path = name.toString().split("\\").join("/");
			if (isAlwaysIgnored(path)) return;
			pending.add(path);
			timer ??= setTimeout(flush, DEBOUNCE_MS);
		});
	} catch {
		// a folder we cannot watch leaves the hooks as the only source
	}
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		watcher?.close();
	};
}
