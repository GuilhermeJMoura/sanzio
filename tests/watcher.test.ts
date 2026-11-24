import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gitBranch, gitMarks, listFiles, readSnapshot, repoInfo, watchTree } from "../src/observe/watcher.ts";
import { tempDir } from "./helpers/pty.ts";
import { gitRepo, sedInPlace } from "./helpers/repo.ts";

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe("watcher scope: the git root, minus .git, node_modules and gitignored files", () => {
	test("repoInfo finds the git root from a subfolder; outside git it is the folder itself", () => {
		const root = gitRepo();
		expect(repoInfo(join(root, "src"))).toEqual({ root, isGit: true });
		const plain = tempDir("sanzio-plain-");
		expect(repoInfo(plain)).toEqual({ root: plain, isGit: false });
		expect(gitBranch(plain)).toBeNull();
		expect(gitBranch(root)).toBe("feat/sessions");
	});

	test("listFiles and the snapshot skip ignored files", async () => {
		const root = gitRepo();
		writeFileSync(join(root, "debug.log"), "noise\n");
		const files = await listFiles({ root, isGit: true });
		expect(files.sort()).toEqual([".gitignore", "config.json", "src/a.ts"]);
		const snap = await readSnapshot(root, files);
		expect(snap.get("src/a.ts")).toBe("export const a = 1;\n");
	});

	test("outside git it lists the folder without .git and node_modules", async () => {
		const root = tempDir("sanzio-plain-");
		mkdirSync(join(root, "node_modules"));
		writeFileSync(join(root, "node_modules/x.js"), "x");
		writeFileSync(join(root, "notes.md"), "n");
		expect(await listFiles({ root, isGit: false })).toEqual(["notes.md"]);
	});

	test("AC3 git marks: M for modified, U for new", async () => {
		const root = gitRepo();
		writeFileSync(join(root, "src/a.ts"), "changed\n");
		writeFileSync(join(root, "src/b.ts"), "new\n");
		expect(await gitMarks(root)).toEqual(
			new Map([
				["src/a.ts", "M"],
				["src/b.ts", "U"],
			]),
		);
	});

	test("AC2 a sed -i edit is reported in well under a second; ignored paths are not", async () => {
		const root = gitRepo();
		const seen: string[] = [];
		stop = watchTree({ root, isGit: true, onChange: (paths) => seen.push(...paths) });
		await Bun.sleep(100);
		const started = performance.now();
		writeFileSync(join(root, "node_modules/dep.js"), "y\n");
		writeFileSync(join(root, "debug.log"), "noise\n");
		Bun.spawnSync(["sh", "-c", `${sedInPlace} s/3600/604800/ config.json`], { cwd: root });
		while (!seen.includes("config.json") && performance.now() - started < 2000) await Bun.sleep(10);
		expect(performance.now() - started).toBeLessThan(1000);
		await Bun.sleep(150);
		expect(seen.filter((p) => p.startsWith("node_modules") || p.startsWith(".git/") || p.endsWith(".log"))).toEqual([]);
	});
});
