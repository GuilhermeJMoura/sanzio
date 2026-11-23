import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PhdtermRun } from "$types/testing.ts";
import { KEY, NOTES, openNotes, startEditing, type } from "./helpers/edit.ts";

let run: PhdtermRun | undefined;
afterEach(() => run?.kill());

const disk = (r: PhdtermRun, file = "notes.txt") => readFileSync(join(r.cwd, file), "utf8");
/** The editor line numbered `n` reads `text` (line number gutter, then the text). */
const line = (n: number, text: string) => new RegExp(`│\\s+${n}\\s+${text}\\s`);

describe("AC1 i (or a double click) edits the whole file with a cursor; esc leaves", () => {
	test("i shows EDITANDO; typing, backspace, arrows, home and end edit; esc leaves", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		r.write(KEY.esc);
		await r.waitForScreen((s) => !s.includes("EDITANDO"), "esc leaves a clean edit");
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO again");

		await type(r, "X");
		r.write(KEY.end);
		await type(r, "!");
		r.write(KEY.down);
		r.write(KEY.home);
		await type(r, "ZZ");
		r.write(KEY.backspace);
		r.write(KEY.down);
		r.write(KEY.right);
		await type(r, "_");
		r.write(KEY.up);
		r.write(KEY.left);
		await type(r, "<");
		// down / up keep the column: Z|beta → ga|mma → ga_|mma → Zb|eta → Zb<eta
		const s = await r.waitForScreen((x) => line(2, "Zb<eta").test(x), "the last edit on screen");
		expect(s).toMatch(line(1, "Xalpha!"));
		expect(s).toMatch(line(3, "ga_mma"));
		expect(s).toMatch(line(4, "delta"));
		expect(s).toContain("EDITANDO ●");
	});

	test("a double click on a viewer line edits with the cursor on that line", async () => {
		run = await openNotes();
		const r = run;
		await r.click("delta", { double: true });
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO");
		await type(r, "Q");
		await r.waitForScreen((s) => line(4, "Qdelta").test(s), "typed on line 4");
	});
});

describe("AC2 ctrl+s writes exactly the screen's text and lists the file under você", () => {
	test("the file on disk is the edited text, under 'você editou', not under 'claude editou'", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "X");
		r.write(KEY.ctrlS);
		const s = await r.waitForScreen((x) => x.includes("você editou"), "você editou");
		expect(disk(r)).toBe(`X${NOTES}\n`);
		expect(s).toMatch(/você editou ─+ 1/);
		expect(s).toMatch(/· notes\.t… \+1 −1/);
		expect(s).toMatch(/claude editou ─+ 0/);
		expect(s).not.toContain("EDITANDO ●");
	});
});

describe("AC3 ctrl+z / ctrl+y undo and redo step by step, down to the opened text", () => {
	test("two keys typed: two undos give the file back, a third does nothing, redo brings them back", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "ab");
		await r.waitForScreen((s) => line(1, "abalpha").test(s), "ab typed");
		r.write(KEY.ctrlZ);
		await r.waitForScreen((s) => line(1, "aalpha").test(s), "one undo");
		r.write(KEY.ctrlZ);
		await r.waitForScreen((s) => line(1, "alpha").test(s), "two undos");
		r.write(KEY.ctrlZ);
		await Bun.sleep(150);
		expect(await r.screen()).toMatch(line(1, "alpha"));
		r.write(KEY.ctrlY);
		await r.waitForScreen((s) => line(1, "aalpha").test(s), "one redo");
		r.write(KEY.ctrlY);
		await r.waitForScreen((s) => line(1, "abalpha").test(s), "two redos");
	});
});

describe("AC4 editing pauses follow; claude's edits elsewhere only raise the notice", () => {
	test("follow on, i: PAUSADO; claude edits src/a.ts: the notice shows and my file stays", async () => {
		run = await openNotes();
		const r = run;
		await r.click("gamma");
		r.write("f");
		await r.waitForScreen((s) => s.includes("SEGUINDO"), "follow on");
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO") && s.includes("PAUSADO"), "EDITANDO PAUSADO");
		await type(r, "M");
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;" });
		const s = await r.waitForScreen((x) => x.includes("o claude editou src/a.ts"), "notice");
		expect(s).toContain("╭─ notes.txt ●");
		expect(s).toMatch(line(1, "Malpha"));
		expect(s).toContain("EDITANDO");
	});
});

describe("AC5 claude writes the file I am editing with unsaved changes", () => {
	const conflicted = async () => {
		const r = await openNotes();
		await startEditing(r);
		await type(r, "MINE ");
		await r.waitForScreen((s) => line(1, "MINE alpha").test(s), "my change");
		await r.claude({ op: "edit", file: "notes.txt", old: "delta", new: "DELTA" });
		await r.waitForScreen((s) => s.includes("o claude mudou este arquivo"), "conflict notice");
		await Bun.sleep(100);
		return r;
	};

	test("recarregar drops mine and shows claude's", async () => {
		run = await conflicted();
		const r = run;
		await r.click("recarregar");
		const s = await r.waitForScreen((x) => !x.includes("o claude mudou este arquivo"), "notice gone");
		expect(s).toMatch(line(1, "alpha"));
		expect(s).toMatch(line(4, "DELTA"));
		expect(s).not.toContain("MINE");
		expect(disk(r)).toBe("alpha\nbeta\ngamma\nDELTA\n");
	});

	test("manter o meu writes mine over claude's", async () => {
		run = await conflicted();
		const r = run;
		await r.click("manter o meu");
		await r.waitForScreen((x) => !x.includes("o claude mudou este arquivo"), "notice gone");
		await r.waitFor(() => disk(r) === `MINE ${NOTES}\n`, "mine on disk");
		expect(await r.screen()).toMatch(line(1, "MINE alpha"));
	});

	test("ver diff dele shows claude's diff and keeps mine", async () => {
		run = await conflicted();
		const r = run;
		await r.click("ver diff dele");
		const diff = await r.waitForScreen((x) => /\+ DELTA/.test(x), "claude's diff");
		expect(diff).toMatch(/− delta/);
		expect(diff).not.toContain("MINE");
		await r.click("voltar ao meu");
		await r.waitForScreen((x) => line(1, "MINE alpha").test(x), "mine again");
		// ctrl+s does not overwrite claude's write behind my back: the notice stays until I pick
		r.write(KEY.ctrlS);
		await Bun.sleep(300);
		expect(disk(r)).toBe("alpha\nbeta\ngamma\nDELTA\n");
		expect(await r.screen()).toContain("o claude mudou este arquivo");
		await r.click("manter o meu");
		await r.waitFor(() => disk(r) === `MINE ${NOTES}\n`, "mine saved");
	});
});

describe("AC6 unsaved text: phdterm asks salvar / descartar / cancelar before losing it", () => {
	test("switching file asks; cancel keeps mine, descartar drops it and opens the other file", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "MINE ");
		await r.click("config.json");
		await r.waitForScreen((s) => s.includes("trocar de arquivo?"), "prompt");
		r.write(KEY.esc);
		let s = await r.waitForScreen((x) => !x.includes("trocar de arquivo?"), "cancelled");
		expect(s).toMatch(line(1, "MINE alpha"));
		expect(s).toContain("╭─ notes.txt ●");

		await r.click("config.json");
		await r.waitForScreen((x) => x.includes("trocar de arquivo?"), "prompt again");
		r.write("d");
		s = await r.waitForScreen((x) => x.includes("╭─ config.json"), "config.json open");
		expect(s).not.toContain("EDITANDO");
		expect(disk(r)).toBe(`${NOTES}\n`);
	});

	test("esc with unsaved text asks; salvar writes it and leaves edit mode", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "MINE ");
		r.write(KEY.esc);
		await r.waitForScreen((s) => s.includes("sair da edição?"), "prompt");
		r.write("s");
		await r.waitForScreen((s) => !s.includes("EDITANDO"), "left edit mode");
		expect(disk(r)).toBe(`MINE ${NOTES}\n`);
	});

	test("claude exits with unsaved text: phdterm asks, salvar writes it, then phdterm exits", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "MINE ");
		await r.click("fake claude ready");
		await Bun.sleep(100);
		r.write("/exit");
		await r.waitForScreen((s) => s.includes("o claude saiu"), "exit prompt");
		r.write("s");
		expect(await r.exited).toBe(0);
		expect(disk(r)).toBe(`MINE ${NOTES}\n`);
	});
});

describe("AC7 v switches the viewer between diff, arquivo marcado and lado a lado, and it sticks", () => {
	const words = Array.from({ length: 12 }, (_, i) => `word${String.fromCharCode(97 + i)}`);

	test("diff folds, arquivo shows every line marked, lado a lado puts old and new on one row", async () => {
		run = await openNotes(`${words.join("\n")}\n`);
		const r = run;
		await r.claude({ op: "edit", file: "notes.txt", old: "wordl", new: "WORDL" });
		await r.waitForScreen((s) => /\+ WORDL/.test(s), "claude's edit");
		await r.click("WORDL");
		let s = await r.screen();
		expect(s).toContain("v diff");
		expect(s).toContain("linhas iguais");
		expect(s).not.toContain("worda");

		r.write("v");
		s = await r.waitForScreen((x) => x.includes("v arquivo"), "arquivo marcado");
		expect(s).toContain("worda");
		expect(s).not.toContain("linhas iguais");
		expect(s).toMatch(/− wordl/);
		expect(s).toMatch(/\+ WORDL/);

		r.write("v");
		s = await r.waitForScreen((x) => x.includes("v lado a lado"), "lado a lado");
		expect(s).toMatch(/12 − wordl.*12 \+ WORDL/);
		expect(s).toMatch(/11\s+wordk.*11\s+wordk/);

		await r.click("config.json");
		s = await r.waitForScreen((x) => x.includes("╭─ config.json"), "another file");
		expect(s).toContain("v lado a lado");

		await r.click("ttl");
		r.write("v");
		await r.waitForScreen((x) => x.includes("v diff"), "back to diff");
	});
});

describe("AC8 claude reads what I saved", () => {
	test("after ctrl+s, claude's Read returns the saved text", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "X");
		r.write(KEY.ctrlS);
		await r.waitFor(() => disk(r) === `X${NOTES}\n`, "saved");
		await r.claude({ op: "read", file: "notes.txt" });
		const read = r.records().find((x) => x.event === "read");
		expect(read?.content).toBe(`X${NOTES}\n`);
	});
});

describe("fix: follow never moves the editor away from unsaved text", () => {
	test("turning follow back on while dirty asks; cancel keeps follow paused and claude's next edit only notifies", async () => {
		run = await openNotes();
		const r = run;
		await r.click("f seguir");
		await r.waitForScreen((s) => s.includes("SEGUINDO"), "follow on");
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;" });
		await r.waitForScreen((s) => s.includes("╭─ src/a.ts") && s.includes("SEGUINDO"), "following src/a.ts");
		await r.click("export const a = 2;");
		await Bun.sleep(100);
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO");
		await type(r, "x");
		await r.click("f seguir");
		await r.waitForScreen((s) => s.includes("voltar a seguir o claude?"), "prompt before follow resumes");
		r.write(KEY.esc);
		let s = await r.waitForScreen((x) => !x.includes("voltar a seguir o claude?"), "cancelled");
		expect(s).toContain("PAUSADO");
		await r.claude({ op: "edit", file: "config.json", old: "3600", new: "60" });
		s = await r.waitForScreen((x) => x.includes("o claude editou config.json"), "notice only");
		expect(s).toContain("╭─ src/a.ts ●");
		expect(s).toContain("EDITANDO ●");
	});

	test("salvar at that prompt writes my text, then follow resumes and goes to claude's next file", async () => {
		run = await openNotes();
		const r = run;
		await r.click("f seguir");
		await r.waitForScreen((s) => s.includes("SEGUINDO"), "follow on");
		await r.claude({ op: "edit", file: "src/a.ts", old: "export const a = 1;", new: "export const a = 2;" });
		await r.waitForScreen((s) => s.includes("╭─ src/a.ts") && s.includes("SEGUINDO"), "following src/a.ts");
		await r.click("export const a = 2;");
		await Bun.sleep(100);
		r.write("i");
		await r.waitForScreen((s) => s.includes("EDITANDO"), "EDITANDO");
		await type(r, "x");
		await r.click("f seguir");
		await r.waitForScreen((s) => s.includes("voltar a seguir o claude?"), "prompt");
		r.write("s");
		await r.waitForScreen((s) => s.includes("SEGUINDO") && !s.includes("EDITANDO"), "following again");
		expect(disk(r, "src/a.ts")).toBe("xexport const a = 2;\n");
		await r.claude({ op: "edit", file: "config.json", old: "3600", new: "60" });
		await r.waitForScreen((s) => s.includes("╭─ config.json"), "editor follows claude");
	});
});

describe("fix: a failed ctrl+s shows the error and phdterm keeps running", () => {
	test("read-only file: the error banner shows, my text stays, a save after chmod works", async () => {
		run = await openNotes();
		const r = run;
		await startEditing(r);
		await type(r, "MINE ");
		chmodSync(join(r.cwd, "notes.txt"), 0o444);
		r.write(KEY.ctrlS);
		const s = await r.waitForScreen((x) => x.includes("não foi possível salvar: EACCES"), "error banner");
		expect(s).toMatch(line(1, "MINE alpha"));
		expect(s).toContain("EDITANDO ●");
		chmodSync(join(r.cwd, "notes.txt"), 0o644);
		r.write(KEY.ctrlS);
		await r.waitForScreen((x) => !x.includes("não foi possível salvar"), "error gone");
		expect(disk(r)).toBe(`MINE ${NOTES}\n`);
	});
});

describe("fix: a file mixing LF and CRLF saves, keeping each line's own ending", () => {
	test("i, type on line 1, ctrl+s: written, and the untouched lines keep their bytes", async () => {
		run = await openNotes("alpha\r\nbeta\ngamma\r\ndelta\n");
		const r = run;
		await startEditing(r);
		await type(r, "X");
		r.write(KEY.ctrlS);
		await r.waitFor(() => disk(r) !== "alpha\r\nbeta\ngamma\r\ndelta\n", "saved", 3000);
		expect(disk(r)).toBe("Xalpha\r\nbeta\ngamma\r\ndelta\n");
		expect(await r.screen()).not.toContain("o claude mudou este arquivo");
	});
});
