import { mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { FakeClaudeRecord, PhdtermRun, PhdtermRunOptions } from "$types/testing.ts";

export const CLI = resolve(import.meta.dir, "../../src/cli.ts");
export const FAKE_BIN = resolve(import.meta.dir, "../fixtures/bin");

export function tempDir(prefix: string): string {
	return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function startPhdterm(options: PhdtermRunOptions): PhdtermRun {
	const scratch = tempDir("phdterm-run-");
	const logFile = join(scratch, "fake-claude.jsonl");
	const configDir = join(scratch, "claude-config");
	const decoder = new TextDecoder();
	let output = "";
	let kittyAnswered = false;
	let markEof: () => void = () => {};
	const eof = new Promise<void>((resolve) => {
		markEof = resolve;
	});

	const proc = Bun.spawn([process.execPath, CLI, ...(options.args ?? [])], {
		cwd: options.cwd,
		env: {
			...process.env,
			PATH: options.path ?? `${FAKE_BIN}:${process.env.PATH ?? ""}`,
			FAKE_CLAUDE_LOG: logFile,
			FAKE_CLAUDE_KEYBOARD: options.keyboard ?? "kitty",
			CLAUDE_CONFIG_DIR: configDir,
			...options.env,
		},
		terminal: {
			cols: options.cols ?? 100,
			rows: options.rows ?? 30,
			data: (terminal, data) => {
				output += decoder.decode(data, { stream: true });
				if (options.kittyHost && !kittyAnswered && output.includes("\x1b[?u")) {
					kittyAnswered = true;
					terminal.write("\x1b[?0u");
				}
			},
			exit: () => markEof(),
		},
	});

	const records = (): FakeClaudeRecord[] => {
		let text = "";
		try {
			text = readFileSync(logFile, "utf8");
		} catch {
			return [];
		}
		return text
			.split("\n")
			.filter((line) => line.length > 0)
			.map((line) => JSON.parse(line) as FakeClaudeRecord);
	};

	return {
		logFile,
		configDir,
		write: (data) => {
			proc.terminal?.write(data);
		},
		resize: (cols, rows) => proc.terminal?.resize(cols, rows),
		output: () => output,
		records,
		inputs: () =>
			Buffer.concat(
				records()
					.filter((r) => r.event === "input" && r.hex !== undefined)
					.map((r) => Buffer.from(r.hex ?? "", "hex")),
			).toString("latin1"),
		waitFor: async (predicate, label, timeoutMs = 8000) => {
			const deadline = Date.now() + timeoutMs;
			while (!predicate()) {
				if (Date.now() > deadline) {
					throw new Error(`timed out waiting for ${label}; output tail: ${JSON.stringify(output.slice(-400))}`);
				}
				await Bun.sleep(25);
			}
		},
		// the PTY can still hold output when the process exits: wait for EOF too
		exited: proc.exited.then(async (code) => {
			await Promise.race([eof, Bun.sleep(1000)]);
			return code;
		}),
		kill: () => proc.kill(),
	};
}

export async function startReady(options: PhdtermRunOptions): Promise<PhdtermRun> {
	const run = startPhdterm(options);
	await run.waitFor(
		() => run.output().includes("ready") && run.records().some((r) => r.event === "start"),
		"fake claude to paint",
	);
	return run;
}
