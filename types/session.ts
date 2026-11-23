export type SessionState = "working" | "idle";

export interface SessionInfo {
	model: string | null;
	effort: string | null;
	state: SessionState | null;
}
