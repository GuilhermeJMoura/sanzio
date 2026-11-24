export type ThemeName = "verniz" | "pergaminho";

/** Syntax colors of the code shown in the editor. */
export interface SyntaxTokens {
	keyword: string;
	string: string;
	function: string;
	type: string;
	number: string;
	comment: string;
}

/** Status line colors: the Sanzio mark, the mode and branch badges and the warning segment. */
export interface StatusTokens {
	markInitial: string;
	markName: string;
	branchBg: string;
	branchFg: string;
	modeBg: string;
	modeFg: string;
	warnBg: string;
	warnFg: string;
}

/** Every color sanzio paints; both themes fill the same tokens. */
export interface Theme {
	name: ThemeName;
	/** behind the panes */
	desk: string;
	/** pane background, also the claude pane's default background */
	bg: string;
	/** status line background */
	bar: string;
	/** soft light behind the splash portrait; banner background */
	glow: string;
	/** unfocused borders and separators */
	border: string;
	/** raised surfaces: inactive buttons, the paused badge, the explorer cursor */
	raised: string;
	/** the open file in the explorer */
	sel: string;
	fg: string;
	strong: string;
	dim: string;
	faint: string;
	/** focus and keys */
	accent: string;
	gold: string;
	lapis: string;
	add: string;
	addBg: string;
	del: string;
	delBg: string;
	mod: string;
	syntax: SyntaxTokens;
	status: StatusTokens;
	/** gradient of the big "Sanzio" letters, top to bottom, and its initial S */
	word: { top: string; bottom: string; initial: string };
}

/** The theme in use and, when the configured name was not a theme, the one-line warning for the status line. */
export interface ThemeSelection {
	name: ThemeName;
	invalid: string | null;
}

/** Where a theme name can come from, highest precedence first. */
export interface ThemeSources {
	env: string | undefined;
	/** raw text of ~/.config/sanzio/config.json, or null when it is missing */
	file: string | null;
}

export interface SanzioConfig {
	theme?: unknown;
}

/** A text/background pair the UI really paints, with the WCAG minimum it must reach. */
export interface ContrastPair {
	label: string;
	fg: string;
	bgs: string[];
	min: number;
}

export type PixelGrid = string[][];

/** One painted terminal cell. */
export interface Cell {
	char: string;
	fg: string;
	bg: string;
	bold: boolean;
}

/** The splash as cells over the claude pane's inside, row by row; `kind` says which layout fit. */
export interface SplashFrame {
	kind: "large" | "compact" | "stacked";
	width: number;
	height: number;
	rows: Cell[][];
	/** top-left cell of the portrait (inside its frame) */
	portrait: { x: number; y: number };
}

/** A big letter: rows of '#' (on) and '.' (off), drawn `top` pixel rows below the cap line. */
export interface Glyph {
	top: number;
	rows: string[];
}

export type MaybeColor = string | null;

/** The color tokens sanzio sets in its Claude Code themes. */
export type ClaudeThemeToken =
	| "claude"
	| "text"
	| "inactive"
	| "subtle"
	| "permission"
	| "promptBorder"
	| "bashBorder"
	| "success"
	| "error"
	| "warning"
	| "diffAdded"
	| "diffRemoved"
	| "diffAddedWord"
	| "diffRemovedWord"
	| "userMessageBackground"
	| "selectionBg";

/** A Claude Code custom theme file: https://code.claude.com/docs/en/terminal-config.md#create-a-custom-theme */
export interface ClaudeThemeFile {
	name: string;
	base: "dark" | "light";
	overrides: Record<ClaudeThemeToken, string>;
}
