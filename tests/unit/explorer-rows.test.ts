import { describe, expect, test } from "bun:test";
import type { ClaudeEdit } from "$types/observe.ts";
import { ancestors, changedRows, treeRows } from "../../src/ui/explorer-rows.ts";

const files = ["README.md", "package.json", "src/auth/session.ts", "src/auth/token.ts", "src/db.ts", "config/app.json"];

describe("AC3 the repo tree marks M / U", () => {
	test("folders first, then files; only expanded folders show their children", () => {
		const rows = treeRows({ files, expanded: new Set(["src"]), marks: new Map(), claude: new Set(), live: null });
		expect(rows.map((r) => `${"  ".repeat(r.depth)}${r.name}${r.kind === "dir" ? "/" : ""}`)).toEqual([
			"config/",
			"src/",
			"  auth/",
			"  db.ts",
			"package.json",
			"README.md",
		]);
	});

	test("git marks show on files; folders holding claude edits are flagged; the live file is marked", () => {
		const rows = treeRows({
			files,
			expanded: new Set(["src", "src/auth"]),
			marks: new Map([
				["src/auth/session.ts", "M"],
				["src/auth/token.ts", "U"],
			]),
			claude: new Set(["src/auth/token.ts"]),
			live: "src/auth/token.ts",
		});
		const byPath = new Map(rows.map((r) => [r.path, r]));
		expect(byPath.get("src/auth/session.ts")).toMatchObject({ mark: "M", live: false });
		expect(byPath.get("src/auth/token.ts")).toMatchObject({ mark: "U", live: true });
		expect(byPath.get("src")).toMatchObject({ dirty: true });
		expect(byPath.get("src/auth")).toMatchObject({ dirty: true, expanded: true });
	});

	test("ancestors opens the path to a file", () => {
		expect(ancestors("src/auth/session.ts")).toEqual(["src", "src/auth"]);
	});
});

describe("AC3 'claude editou' rows", () => {
	test("name, folder, +/− and age of each edit, in the given order", () => {
		const edits: ClaudeEdit[] = [
			{ path: "src/auth/token.ts", tool: "Write", at: 9000, isNew: true, stats: { added: 5, removed: 0 } },
			{ path: "README.md", tool: "Edit", at: 1000, isNew: false, stats: { added: 1, removed: 1 } },
		];
		expect(changedRows(edits, 10_000)).toEqual([
			{ path: "src/auth/token.ts", name: "token.ts", dir: "src/auth", isNew: true, added: 5, removed: 0, age: "agora" },
			{ path: "README.md", name: "README.md", dir: "", isNew: false, added: 1, removed: 1, age: "9s" },
		]);
	});
});
