import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SanzioRun } from "$types/testing.ts";
import type { ClaudeThemeToken, ThemeName } from "$types/theme.ts";
import { claudeTheme, PLUGIN_DIR } from "../src/claude-theme.ts";
import { THEMES } from "../src/ui/theme.ts";
import { startSanzio, tempDir } from "./helpers/pty.ts";

let run: SanzioRun | undefined;
afterEach(() => run?.kill());

const TOKENS: ClaudeThemeToken[] = [
	"claude",
	"text",
	"inactive",
	"subtle",
	"permission",
	"promptBorder",
	"bashBorder",
	"success",
	"error",
	"warning",
	"diffAdded",
	"diffRemoved",
	"diffAddedWord",
	"diffRemovedWord",
	"userMessageBackground",
	"selectionBg",
];

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const listAll = (dir: string): string[] =>
	existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).map(String).sort() : [];
// bun's own transpiler cache lands in the temp HOME (macOS Library/Caches); anything else would be a write by sanzio
const listHome = (home: string): string[] => listAll(home).filter((p) => !p.startsWith("Library"));

describe("AC8 sanzio ships a Claude Code plugin with its two themes", () => {
	test("the manifest is named sanzio", () => {
		expect(readJson(join(PLUGIN_DIR, ".claude-plugin", "plugin.json"))).toMatchObject({ name: "sanzio" });
	});

	for (const [name, base] of [
		["verniz", "dark"],
		["pergaminho", "light"],
	] as const) {
		test(`themes/${name}.json is valid, base ${base}, every token #rrggbb from the sanzio palette`, () => {
			const file = readJson(join(PLUGIN_DIR, "themes", `${name}.json`)) as Record<string, unknown>;
			expect(file.base).toBe(base);
			expect(typeof file.name).toBe("string");
			const overrides = file.overrides as Record<string, string>;
			expect(Object.keys(overrides).sort()).toEqual([...TOKENS].sort());
			for (const token of TOKENS) expect(overrides[token]).toMatch(/^#[0-9a-f]{6}$/);
			// the committed file is exactly what the palette derives: they cannot drift apart
			expect(file).toEqual(claudeTheme(THEMES[name]) as unknown as Record<string, unknown>);
			expect(overrides.claude).toBe(THEMES[name].gold);
			expect(overrides.text).toBe(THEMES[name].fg);
		});

		test(`${name}: the lines around claude's input are sanzio's muted pane border, not lapis`, () => {
			const { overrides } = claudeTheme(THEMES[name]);
			expect(overrides.promptBorder).toBe(THEMES[name].border);
			expect(overrides.promptBorder).not.toBe(THEMES[name].lapis);
			expect(overrides.bashBorder).not.toBe(THEMES[name].lapis);
			// permission dialogs keep their lapis accent
			expect(overrides.permission).toBe(THEMES[name].lapis);
		});
	}
});

describe("AC8 claude runs with sanzio's theme, and no settings file is written", () => {
	async function launch(theme: ThemeName | null) {
		const home = tempDir("sanzio-home-");
		const configDir = join(home, "claude-config");
		mkdirSync(configDir, { recursive: true });
		const userSettings = `${JSON.stringify({ theme: "dark" })}\n`;
		writeFileSync(join(configDir, "settings.json"), userSettings);
		const cwd = tempDir("sanzio-theme-");
		const env: Record<string, string> = { HOME: home, CLAUDE_CONFIG_DIR: configDir };
		if (theme) env.SANZIO_THEME = theme;
		const before = { home: listHome(home) };
		const r = startSanzio({ cwd, cols: 100, rows: 30, env });
		run = r;
		await r.waitFor(() => r.records().some((x) => x.event === "start"), "fake claude start");
		const argv = r.records().find((x) => x.event === "start")?.argv ?? [];
		return { r, argv, home, configDir, cwd, before, userSettings };
	}

	for (const name of [null, "pergaminho"] as const) {
		const slug = name ?? "verniz";
		test(`${name ? "SANZIO_THEME=pergaminho" : "no configuration"}: --plugin-dir and theme custom:sanzio:${slug}`, async () => {
			const { r, argv, home, configDir, cwd, before, userSettings } = await launch(name);
			const at = argv.indexOf("--plugin-dir");
			expect(at).toBeGreaterThan(0);
			expect(argv[at + 1]).toBe(PLUGIN_DIR);
			expect(existsSync(join(argv[at + 1] ?? "", "themes", `${slug}.json`))).toBe(true);
			expect(argv[0]).toBe("--settings");
			const settings = JSON.parse(argv[1] ?? "{}");
			expect(settings.theme).toBe(`custom:sanzio:${slug}`);
			expect(settings.hooks.PostToolUse).toHaveLength(1);

			await r.waitForScreen((s) => s.includes("ready"), "claude ready");
			expect(await r.screen()).not.toContain("/theme light");
			// nothing written: the user's claude settings, the home and the project stay as they were
			expect(readFileSync(join(configDir, "settings.json"), "utf8")).toBe(userSettings);
			expect(listHome(home)).toEqual(before.home);
			expect(existsSync(join(cwd, ".claude"))).toBe(false);
			expect(listAll(join(PLUGIN_DIR, "themes"))).toEqual(["pergaminho.json", "verniz.json"]);
		});
	}
});
