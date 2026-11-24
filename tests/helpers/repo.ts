import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./pty.ts";

export const git = (cwd: string, ...args: string[]) =>
	Bun.spawnSync(["git", ...args], { cwd, stdout: "ignore", stderr: "ignore" });

/** A committed repo on branch feat/sessions with an ignored dist/ and *.log, and a node_modules folder. */
export function gitRepo(): string {
	const root = tempDir("sanzio-repo-");
	git(root, "init", "-q", "-b", "feat/sessions");
	mkdirSync(join(root, "src"));
	mkdirSync(join(root, "node_modules"));
	writeFileSync(join(root, ".gitignore"), "dist/\n*.log\nnode_modules/\n");
	writeFileSync(join(root, "src/a.ts"), "export const a = 1;\n");
	writeFileSync(join(root, "config.json"), '{ "ttl": 3600 }\n');
	writeFileSync(join(root, "node_modules/dep.js"), "x\n");
	git(root, "add", ".");
	git(root, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
	return root;
}

export const sedInPlace = process.platform === "darwin" ? "sed -i ''" : "sed -i";
