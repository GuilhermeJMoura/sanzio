import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EditSnapshot, EditSurface } from "$types/edit.ts";
import { createEditController } from "../../src/edit-controller.ts";
import { SessionChanges } from "../../src/observe/session-changes.ts";
import { tempDir } from "../helpers/pty.ts";

/** The textarea stand-in: holds a snapshot, `type` replaces the text like a person typing would. */
function fakeSurface(): EditSurface & { type(text: string): void } {
	let snap: EditSnapshot = { text: "", cursor: 0 };
	return {
		load: (text) => {
			snap = { text, cursor: 0 };
		},
		set: (next) => {
			snap = next;
		},
		snapshot: () => snap,
		page: () => {},
		type: (text) => {
			snap = { text, cursor: text.length };
		},
	};
}

function setup(files: Record<string, string | Uint8Array>) {
	const root = tempDir("phdterm-edit-");
	for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
	const surface = fakeSurface();
	const edit = createEditController({
		root,
		surface,
		changes: new SessionChanges(),
		now: () => 0,
		render: () => {},
		onStart: () => {},
	});
	return { root, surface, edit };
}

describe("fix: a file that is not valid UTF-8 opens só leitura, never saved lossy", () => {
	test("Latin-1 'café' (byte E9) cannot enter edit mode", async () => {
		const { edit } = setup({ "latin.txt": Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) });
		await edit.enter("latin.txt", 1);
		expect(edit.model("latin.txt")).toMatchObject({ active: false, readOnly: true });
	});

	test("valid UTF-8 'café' still edits", async () => {
		const { edit } = setup({ "utf8.txt": "café\n" });
		await edit.enter("utf8.txt", 1);
		expect(edit.model("utf8.txt")).toMatchObject({ active: true, readOnly: false });
	});
});
