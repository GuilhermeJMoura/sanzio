export interface FakeClaudeRecord {
	event: "start" | "input" | "resize" | "hook" | "done";
	/** control op id, on "done" */
	id?: string;
	/** hook event name and tool, on "hook" */
	name?: string;
	tool?: string;
	argv?: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
	cols?: number;
	rows?: number;
	hex?: string;
}

/** What the test asks the fake claude to do, as claude would: through its tools, firing the hooks it was given. */
export type FakeClaudeOp =
	| { op: "edit"; file: string; old: string; new: string }
	| { op: "write"; file: string; content: string }
	| { op: "bash"; command: string };

export interface PhdtermRunOptions {
	args?: string[];
	cwd: string;
	env?: Record<string, string | undefined>;
	cols?: number;
	rows?: number;
	keyboard?: "kitty" | "legacy";
	/** Answer the kitty keyboard query like a host terminal that supports the protocol. */
	kittyHost?: boolean;
	path?: string;
}

export interface PhdtermRun {
	logFile: string;
	configDir: string;
	write(data: string): void;
	resize(cols: number, rows: number): void;
	output(): string;
	records(): FakeClaudeRecord[];
	inputs(): string;
	waitFor(predicate: () => boolean, label: string, timeoutMs?: number): Promise<void>;
	/** Makes the fake claude run a tool call and resolves once its PostToolUse hooks returned. */
	claude(op: FakeClaudeOp): Promise<void>;
	/** The host screen as text, rebuilt from the output by a headless terminal. */
	screen(): Promise<string>;
	/** Resolves with the screen once `predicate` holds for it. */
	waitForScreen(predicate: (screen: string) => boolean, label: string, timeoutMs?: number): Promise<string>;
	exited: Promise<number>;
	kill(): void;
}
