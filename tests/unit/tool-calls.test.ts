import { describe, expect, test } from "bun:test";
import { STALE_CALL_MS, ToolCalls } from "../../src/observe/tool-calls.ts";

describe("in-flight tool calls: only real ones keep claude busy", () => {
	test("Pre then Post by tool_use_id ends the call; the last file is the current one", () => {
		const calls = new ToolCalls();
		calls.start("t1", "src/a.ts", 0);
		calls.start("t2", null, 10);
		expect(calls.active(20)).toBe(true);
		expect(calls.current()).toBe("src/a.ts");
		calls.end("t1");
		calls.end("t2");
		expect(calls.active(30)).toBe(false);
		expect(calls.current()).toBeNull();
	});

	test("a Pre with no Post (denied, interrupted) stops counting when claude goes idle", () => {
		const calls = new ToolCalls();
		calls.start("t1", "src/a.ts", 0);
		calls.clear();
		expect(calls.active(1)).toBe(false);
	});

	test("and expires on its own after a while", () => {
		const calls = new ToolCalls();
		calls.start("t1", "src/a.ts", 0);
		expect(calls.active(STALE_CALL_MS - 1)).toBe(true);
		expect(calls.active(STALE_CALL_MS + 1)).toBe(false);
		expect(calls.current()).toBeNull();
	});
});
