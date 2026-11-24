import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

// the Dracula palette the app used before the Renaissance themes
const DRACULA = [
	"#21222c",
	"#282a36",
	"#191a21",
	"#343746",
	"#44475a",
	"#f8f8f2",
	"#a4a8c4",
	"#6272a4",
	"#bd93f9",
	"#9580c9",
	"#3d3951",
	"#50fa7b",
	"#2c3f3d",
	"#ff5555",
	"#422f3a",
	"#ffb86c",
	"#ff79c6",
	"#f1fa8c",
	"#8be9fd",
	"#78c6d9",
];

test("AC5 no Dracula color is left in src/", () => {
	const root = join(import.meta.dir, "..");
	const hits = [...new Glob("src/**/*.ts").scanSync(root)].flatMap((file) => {
		const text = readFileSync(join(root, file), "utf8").toLowerCase();
		return DRACULA.filter((hex) => text.includes(hex)).map((hex) => `${file}: ${hex}`);
	});
	expect(hits).toEqual([]);
	expect(readFileSync(join(root, "src/ui/theme.ts"), "utf8")).not.toContain("DRACULA");
});
