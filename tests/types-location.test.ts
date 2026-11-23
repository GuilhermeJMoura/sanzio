import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

test("no type or interface is declared under src/ (they live in types/)", () => {
	const root = join(import.meta.dir, "..");
	const offenders = [...new Glob("src/**/*.ts").scanSync(root)].filter((file) =>
		/^\s*(export\s+)?(type|interface)\s+\w+/m.test(readFileSync(join(root, file), "utf8")),
	);
	expect(offenders).toEqual([]);
});
