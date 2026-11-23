import { appendFileSync, mkdtempSync, readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EmbeddedTerminalRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import type { FakeClaudeOp, FakeClaudeRecord, PhdtermRun, PhdtermRunOptions } from "$types/testing.ts";

export const CLI = resolve(import.meta.dir, "../../src/cli.ts");
export const FAKE_BIN = resolve(import.meta.dir, "../fixtures/bin");
const SYNC_BEGIN = Buffer.from("\x1b[?2026h");
const SYNC_END = Buffer.from("\x1b[?2026l");

export function tempDir(prefix: string): string {
	return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function startPhdterm(options: PhdtermRunOptions): PhdtermRun {
	const scratch = tempDir("phdterm-run-");
	const logFile = join(scratch, "fake-claude.jsonl");
	const configDir = join(scratch, "claude-config");
	const controlFile = join(scratch, "fake-claude-control.jsonl");
	let opCount = 0;
	const cols = options.cols ?? 100;
	const rows = options.rows ?? 30;
	// a headless VT of the host's size: tests read the screen the user would see, not the raw byte stream
	let vt: EmbeddedTerminalRenderable | null = null;
	const early: Uint8Array[] = [];
	let held = Buffer.alloc(0);
	const vtSetup = createTestRenderer({ width: 10, height: 4 }).then((setup) => {
		vt = new EmbeddedTerminalRenderable(setup.renderer, { cols, rows });
		setup.renderer.root.add(vt);
		for (const chunk of early) vt.write(chunk);
		return setup;
	});
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
			FAKE_CLAUDE_CONTROL: controlFile,
			FAKE_CLAUDE_KEYBOARD: options.keyboard ?? "kitty",
			CLAUDE_CONFIG_DIR: configDir,
			...options.env,
		},
		terminal: {
			cols,
			rows,
			data: (terminal, data) => {
				output += decoder.decode(data, { stream: true });
				// like a host terminal, show a synchronized update (CSI ? 2026 h … l) only once it is complete
				held = Buffer.concat([held, data]);
				const open = held.lastIndexOf(SYNC_BEGIN);
				const cut = open > held.lastIndexOf(SYNC_END) ? open : held.length;
				const ready = new Uint8Array(held.subarray(0, cut));
				held = held.subarray(cut);
				if (vt) vt.write(ready);
				else early.push(ready);
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

	const screen = async () => {
		const setup = await vtSetup;
		await setup.renderOnce();
		return vt ? vt.screen().lines.join("\n") : "";
	};

	const waitFor = async (predicate: () => boolean, label: string, timeoutMs = 8000) => {
		const deadline = Date.now() + timeoutMs;
		while (!predicate()) {
			if (Date.now() > deadline) {
				throw new Error(`timed out waiting for ${label}; output tail: ${JSON.stringify(output.slice(-400))}`);
			}
			await Bun.sleep(25);
		}
	};

	const sgrClick = (col: number, row: number) => `\x1b[<0;${col};${row}M\x1b[<0;${col};${row}m`;

	return {
		cwd: options.cwd,
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
		waitFor,
		claude: async (op: FakeClaudeOp) => {
			const id = `op-${++opCount}`;
			appendFileSync(controlFile, `${JSON.stringify({ id, ...op })}\n`);
			await waitFor(() => records().some((r) => r.event === "done" && r.id === id), `fake claude ${op.op}`);
		},
		screen,
		waitForScreen: async (predicate, label, timeoutMs = 8000) => {
			const deadline = Date.now() + timeoutMs;
			let last = "";
			for (;;) {
				last = await screen();
				if (predicate(last)) return last;
				if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}; screen:\n${last}`);
				await Bun.sleep(25);
			}
		},
		click: async (text, clickOptions = {}) => {
			const lines = (await screen()).split("\n");
			let seen = 0;
			for (const [row, line] of lines.entries()) {
				const pattern = typeof text === "string" ? null : new RegExp(text.source, `${text.flags.replace("g", "")}g`);
				const hits: number[] = [];
				if (pattern) for (const m of line.matchAll(pattern)) hits.push(m.index ?? 0);
				else
					for (let at = line.indexOf(text as string); at >= 0; at = line.indexOf(text as string, at + 1)) hits.push(at);
				for (const at of hits) {
					if (seen++ !== (clickOptions.nth ?? 0)) continue;
					// screen cells are code points: the column is the count of characters before the match
					const col = [...line.slice(0, at)].length + 1;
					proc.terminal?.write(sgrClick(col, row + 1));
					if (clickOptions.double) proc.terminal?.write(sgrClick(col, row + 1));
					return;
				}
			}
			throw new Error(`nothing to click: ${String(text)} not on screen:\n${lines.join("\n")}`);
		},
		// the PTY can still hold output when the process exits: wait for EOF too
		exited: proc.exited.then(async (code) => {
			await Promise.race([eof, Bun.sleep(1000)]);
			return code;
		}),
		kill: () => {
			proc.kill();
			void vtSetup.then((setup) => setup.renderer.destroy());
		},
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
