import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configPath, loadTheme, selectTheme, themeWarning } from "../../src/config.ts";
import { PERGAMINHO, THEMES, theme, useTheme, VERNIZ } from "../../src/ui/theme.ts";
import { tempDir } from "../helpers/pty.ts";

const file = (theme: unknown) => JSON.stringify({ theme });

describe("AC5 / AC6 theme selection", () => {
	test("no configuration: verniz, no warning", () => {
		expect(selectTheme({ env: undefined, file: null })).toEqual({ name: "verniz", invalid: null });
		expect(selectTheme({ env: "", file: null })).toEqual({ name: "verniz", invalid: null });
	});

	test('{"theme":"pergaminho"} in the file or SANZIO_THEME=pergaminho picks pergaminho', () => {
		expect(selectTheme({ env: undefined, file: file("pergaminho") })).toEqual({ name: "pergaminho", invalid: null });
		expect(selectTheme({ env: "pergaminho", file: null })).toEqual({ name: "pergaminho", invalid: null });
	});

	test("the environment variable wins over the file", () => {
		expect(selectTheme({ env: "verniz", file: file("pergaminho") }).name).toBe("verniz");
		expect(selectTheme({ env: "pergaminho", file: file("verniz") }).name).toBe("pergaminho");
		expect(selectTheme({ env: "perganinho", file: file("pergaminho") })).toEqual({
			name: "verniz",
			invalid: "perganinho",
		});
	});

	test("an invalid value falls back to verniz and is reported", () => {
		expect(selectTheme({ env: "perganinho", file: null })).toEqual({ name: "verniz", invalid: "perganinho" });
		expect(selectTheme({ env: undefined, file: file("dracula") })).toEqual({ name: "verniz", invalid: "dracula" });
		expect(selectTheme({ env: undefined, file: file(42) })).toEqual({ name: "verniz", invalid: "42" });
	});

	test("a missing file, broken JSON or no theme key is the default, without error", () => {
		for (const text of [null, "{", "[]", "null", "{}", '{"other":1}']) {
			expect(selectTheme({ env: undefined, file: text })).toEqual({ name: "verniz", invalid: null });
		}
	});

	test("loadTheme reads ~/.config/sanzio/config.json under HOME, and SANZIO_THEME", () => {
		const home = tempDir("sanzio-home-");
		expect(loadTheme({ HOME: home })).toEqual({ name: "verniz", invalid: null });
		mkdirSync(join(home, ".config", "sanzio"), { recursive: true });
		writeFileSync(configPath({ HOME: home }), file("pergaminho"));
		expect(configPath({ HOME: home })).toBe(join(home, ".config", "sanzio", "config.json"));
		expect(loadTheme({ HOME: home }).name).toBe("pergaminho");
		expect(loadTheme({ HOME: home, SANZIO_THEME: "verniz" }).name).toBe("verniz");
	});

	test("the warning names the value, and is shorter on narrow screens", () => {
		expect(themeWarning("perganinho", false)).toBe(' ⚠ tema "perganinho" inválido, usando "verniz" ');
		expect(themeWarning("perganinho", true)).toBe(" ⚠ tema inválido: verniz ");
	});

	test("both themes fill the same tokens; useTheme swaps the live theme", () => {
		const keys = (o: object): string[] =>
			Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
		expect(keys(PERGAMINHO).sort()).toEqual(keys(VERNIZ).sort());
		useTheme("pergaminho");
		expect(theme).toEqual(THEMES.pergaminho);
		useTheme("verniz");
		expect(theme).toEqual(THEMES.verniz);
	});
});
