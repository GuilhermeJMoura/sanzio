import type { ToolCall } from "$types/observe.ts";

/** A Pre whose Post never came (denied, interrupted, crashed) stops counting after this long. */
export const STALE_CALL_MS = 10 * 60_000;

/** Tool calls claude has started and not finished, keyed by tool_use_id. */
export class ToolCalls {
	private readonly calls = new Map<string, ToolCall>();

	start(id: string, file: string | null, at: number): void {
		this.calls.set(id, { file, at });
	}

	end(id: string): void {
		this.calls.delete(id);
	}

	/** Claude went idle: nothing it started is still running. */
	clear(): void {
		this.calls.clear();
	}

	active(now: number): boolean {
		for (const [id, call] of this.calls) if (now - call.at > STALE_CALL_MS) this.calls.delete(id);
		return this.calls.size > 0;
	}

	/** File of the most recent running call that has one. */
	current(): string | null {
		let latest: ToolCall | null = null;
		for (const call of this.calls.values()) if (call.file && (!latest || call.at >= latest.at)) latest = call;
		return latest?.file ?? null;
	}
}
