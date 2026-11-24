import { describe, expect, test } from "bun:test";
import { formatAge, SessionChanges } from "../../src/observe/session-changes.ts";

function session() {
	const changes = new SessionChanges();
	changes.setBase("src/a.ts", "one\ntwo\nthree\n");
	changes.setBase("src/b.ts", "b\n");
	changes.setBase("src/new.ts", null);
	return changes;
}

describe("AC3 'claude editou' lists each file with +/−, age, newest first", () => {
	test("claude edits are listed newest first with +/− against the session start", () => {
		const s = session();
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\nfour\n", byClaude: true, tool: "Edit", at: 1000 });
		s.apply({ path: "src/new.ts", content: "x\ny\n", byClaude: true, tool: "Write", at: 2000 });
		const list = s.claudeEdits();
		expect(list.map((e) => e.path)).toEqual(["src/new.ts", "src/a.ts"]);
		expect(list[0]).toMatchObject({ isNew: true, stats: { added: 2, removed: 0 } });
		expect(list[1]).toMatchObject({ isNew: false, stats: { added: 2, removed: 1 } });
		expect(s.totals()).toEqual({ added: 4, removed: 1, files: 2 });
	});

	test("a second edit of the same file moves it back to the top and keeps the stats cumulative", () => {
		const s = session();
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\n", byClaude: true, tool: "Edit", at: 1000 });
		s.apply({ path: "src/b.ts", content: "B\n", byClaude: true, tool: "Edit", at: 2000 });
		s.apply({ path: "src/a.ts", content: "one\nTWO\nTHREE\n", byClaude: true, tool: "Bash", at: 3000 });
		expect(s.claudeEdits().map((e) => [e.path, e.tool, e.stats.added])).toEqual([
			["src/a.ts", "Bash", 2],
			["src/b.ts", "Edit", 1],
		]);
	});

	test("changes made while claude is not working stay out of the list", () => {
		const s = session();
		expect(s.apply({ path: "src/b.ts", content: "mine\n", byClaude: false, tool: "watcher", at: 1000 })).toBe(true);
		expect(s.claudeEdits()).toEqual([]);
		expect(s.lastEdit).toBeNull();
	});

	test("the same content reported twice (hook, then watcher) counts once", () => {
		const s = session();
		expect(s.apply({ path: "src/b.ts", content: "B\n", byClaude: true, tool: "Edit", at: 1000 })).toBe(true);
		expect(s.apply({ path: "src/b.ts", content: "B\n", byClaude: true, tool: "Bash", at: 1100 })).toBe(false);
		expect(s.claudeEdits()[0]?.tool).toBe("Edit");
	});

	test("ages read agora, seconds, minutes, hours", () => {
		expect(formatAge(1500)).toBe("agora");
		expect(formatAge(42_000)).toBe("42s");
		expect(formatAge(5 * 60_000)).toBe("5m");
		expect(formatAge(3 * 3_600_000)).toBe("3h");
	});
});

describe("AC2 the lines of the last edit get ◂ claude", () => {
	test("without a patch, the just lines are what this edit added over the previous content", () => {
		const s = session();
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\n", byClaude: true, tool: "Edit", at: 1000 });
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\nfour\nfive\n", byClaude: true, tool: "Bash", at: 2000 });
		expect(s.lastEdit).toEqual({ path: "src/a.ts", tool: "Bash", at: 2000, justLines: [4, 5] });
	});

	test("the structuredPatch lines win when the hook sent them", () => {
		const s = session();
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\n", byClaude: true, tool: "Edit", at: 1, justLines: [2] });
		expect(s.lastEdit?.justLines).toEqual([2]);
	});

	test("viewerRows shows the diff against the session start", () => {
		const s = session();
		s.apply({ path: "src/a.ts", content: "one\nTWO\nthree\n", byClaude: true, tool: "Edit", at: 1 });
		const kinds = s.viewerRows("src/a.ts").map((r) => r.kind);
		expect(kinds).toEqual(["eq", "del", "add", "eq"]);
	});
});

describe("AC2 a ctrl+s save is the user's change, not claude's", () => {
	test("listed under yourEdits with +/−, left out of claude's list and totals", () => {
		const s = session();
		s.apply({ path: "src/b.ts", content: "B\nmore\n", byClaude: false, byYou: true, tool: "sanzio", at: 1000 });
		expect(s.yourEdits()).toMatchObject([{ path: "src/b.ts", stats: { added: 2, removed: 1 } }]);
		expect(s.claudeEdits()).toEqual([]);
		expect(s.totals()).toEqual({ added: 0, removed: 0, files: 0 });
	});
});
