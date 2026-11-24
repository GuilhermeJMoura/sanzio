import { join } from "node:path";
import type { ClaudeThemeFile, Theme, ThemeName } from "$types/theme.ts";

/** sanzio's Claude Code plugin: it only carries the two themes, handed to claude with --plugin-dir. */
export const PLUGIN_DIR = join(import.meta.dir, "..", "plugin");
export const PLUGIN_NAME = "sanzio";

/** The `theme` value claude reads from --settings to pick the plugin's theme. */
export const claudeThemeKey = (name: ThemeName): string => `custom:${PLUGIN_NAME}:${name}`;

const channels = (hex: string): number[] => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

/** `from` moved `amount` (0..1) of the way to `to`, as #rrggbb. */
function mix(from: string, to: string, amount: number): string {
	const a = channels(from);
	const b = channels(to);
	return `#${a
		.map((v, i) =>
			Math.round(v + ((b[i] ?? v) - v) * amount)
				.toString(16)
				.padStart(2, "0"),
		)
		.join("")}`;
}

/** claude's colors in sanzio's palette; the committed plugin/themes/*.json files are exactly this. */
export function claudeTheme(t: Theme): ClaudeThemeFile {
	const light = t.name === "pergaminho";
	return {
		name: `Sanzio ${t.name}`,
		base: light ? "light" : "dark",
		overrides: {
			claude: t.gold,
			text: t.fg,
			inactive: t.dim,
			subtle: t.border,
			permission: t.lapis,
			promptBorder: t.lapis,
			bashBorder: t.status.markInitial,
			success: t.add,
			error: t.del,
			warning: t.mod,
			diffAdded: t.addBg,
			diffRemoved: t.delBg,
			diffAddedWord: mix(t.addBg, t.add, 0.3),
			diffRemovedWord: mix(t.delBg, t.del, 0.3),
			userMessageBackground: t.raised,
			selectionBg: t.sel,
		},
	};
}
