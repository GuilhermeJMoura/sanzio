import { describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
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
	const root = tempDir("sanzio-edit-");
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

describe("fix: a failed save keeps my text, shows the error and never exits", () => {
	test("a read-only file: save resolves false, the error shows, the text stays unsaved", async () => {
		const { root, surface, edit } = setup({ "notes.txt": "alpha\n" });
		await edit.enter("notes.txt", 1);
		surface.type("MINE alpha");
		chmodSync(join(root, "notes.txt"), 0o444);
		expect(await edit.save()).toBe(false);
		expect(edit.model("notes.txt")).toMatchObject({ active: true, dirty: true });
		expect(edit.model("notes.txt").error).toContain("não foi possível salvar");
		expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("alpha\n");

		chmodSync(join(root, "notes.txt"), 0o644);
		expect(await edit.save()).toBe(true);
		expect(edit.model("notes.txt")).toMatchObject({ dirty: false, error: null });
		expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("MINE alpha\n");
	});

	test("claude exited: salvar failing keeps sanzio open on the prompt; a save that works lets it close", async () => {
		const { root, surface, edit } = setup({ "notes.txt": "alpha\n" });
		await edit.enter("notes.txt", 1);
		surface.type("MINE alpha");
		chmodSync(join(root, "notes.txt"), 0o444);
		let closed = false;
		const exit = edit.confirmExit().then(() => {
			closed = true;
		});
		await edit.prompt("save");
		expect(closed).toBe(false);
		expect(edit.model("notes.txt")).toMatchObject({ active: true, dirty: true, prompt: "exit" });

		chmodSync(join(root, "notes.txt"), 0o644);
		await edit.prompt("save");
		await exit;
		expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("MINE alpha\n");
	});

	test("the file changed on disk since I opened it: save goes to the conflict instead of overwriting", async () => {
		const { root, surface, edit } = setup({ "notes.txt": "alpha\n" });
		await edit.enter("notes.txt", 1);
		surface.type("MINE alpha");
		writeFileSync(join(root, "notes.txt"), "THEIRS\n");
		expect(await edit.save()).toBe(false);
		expect(edit.model("notes.txt").conflict).not.toBeNull();
		expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("THEIRS\n");

		await edit.conflict("keep");
		expect(readFileSync(join(root, "notes.txt"), "utf8")).toBe("MINE alpha\n");
	});
});

describe("fix: claude rewriting the edited file with invalid UTF-8 makes it só leitura", () => {
	test("clean session: the editor leaves edit mode instead of loading replacement characters", async () => {
		const { root, surface, edit } = setup({ "notes.txt": "café\n" });
		await edit.enter("notes.txt", 1);
		writeFileSync(join(root, "notes.txt"), Uint8Array.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
		await edit.external("notes.txt", readFileSync(join(root, "notes.txt"), "utf8"));
		expect(edit.model("notes.txt")).toMatchObject({ active: false, readOnly: true });
		expect(surface.snapshot().text).not.toContain("�");
	});
});
