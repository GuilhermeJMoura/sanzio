export interface FakeClaudeRecord {
	event: "start" | "input" | "resize";
	argv?: string[];
	cwd?: string;
	env?: Record<string, string | undefined>;
	cols?: number;
	rows?: number;
	hex?: string;
}

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
	exited: Promise<number>;
	kill(): void;
}
