import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SanzioConfig, ThemeName, ThemeSelection, ThemeSources } from "$types/theme.ts";

export const DEFAULT_THEME: ThemeName = "verniz";
const NAMES: readonly ThemeName[] = ["verniz", "pergaminho"];

export function configPath(env: Record<string, string | undefined>): string {
	return join(env.HOME || homedir(), ".config", "sanzio", "config.json");
}

/** The config file's text, or null when it cannot be read. */
export function readConfigText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function themeInFile(text: string | null): unknown {
	if (text === null) return undefined;
	try {
		const parsed: unknown = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		return (parsed as SanzioConfig).theme;
	} catch {
		// a broken file is the same as no file: the default theme, no error
		return undefined;
	}
}

const isThemeName = (value: unknown): value is ThemeName => NAMES.includes(value as ThemeName);

/** SANZIO_THEME wins over the file; a name that is not a theme falls back to verniz and is reported. */
export function selectTheme(sources: ThemeSources): ThemeSelection {
	const env = sources.env?.trim();
	const value = env ? env : themeInFile(sources.file);
	if (value === undefined) return { name: DEFAULT_THEME, invalid: null };
	if (isThemeName(value)) return { name: value, invalid: null };
	return { name: DEFAULT_THEME, invalid: typeof value === "string" ? value : JSON.stringify(value) };
}

export function loadTheme(env: Record<string, string | undefined>): ThemeSelection {
	return selectTheme({ env: env.SANZIO_THEME, file: readConfigText(configPath(env)) });
}

/** The one-line status warning for an invalid theme name; shorter on narrow screens. */
export function themeWarning(invalid: string, narrow: boolean): string {
	return narrow ? ` ⚠ tema inválido: ${DEFAULT_THEME} ` : ` ⚠ tema "${invalid}" inválido, usando "${DEFAULT_THEME}" `;
}
