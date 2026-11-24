export type SessionState = "working" | "idle";

export interface SessionInfo {
	model: string | null;
	effort: string | null;
	state: SessionState | null;
}

export interface WatchSessionOptions {
	cwd: string;
	/** pid of the claude process, used to find its session in `<config>/sessions/<pid>.json` */
	pid: number;
	/** transcripts written before this time (ms) are ignored when falling back to the newest one */
	since: number;
	env?: Record<string, string | undefined>;
}
