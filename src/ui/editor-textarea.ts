import type { CliRenderer, KeyEvent, SyntaxStyle } from "@opentui/core";
import { defaultTextareaKeyBindings, LineNumberRenderable, TextareaRenderable } from "@opentui/core";
import type { EditSnapshot } from "$types/edit.ts";
import { DRACULA } from "./theme.ts";

const d = DRACULA;

// home / end stay on the line, like any editor; undo, redo and page keys are sanzio's (its own history)
const KEY_BINDINGS = [
	...defaultTextareaKeyBindings.filter(
		(b) => !["home", "end"].includes(b.name) && !["undo", "redo", "submit"].includes(b.action),
	),
	{ name: "home", action: "line-home" as const },
	{ name: "end", action: "line-end" as const },
];

/** The whole file with a cursor, in the editor pane; sanzio feeds it text and reads it back. */
export function createEditSurface(
	renderer: CliRenderer,
	style: SyntaxStyle,
	handlers: { onKey: (key: KeyEvent) => void; onChange: () => void },
) {
	let applying = false;
	const area = new TextareaRenderable(renderer, {
		id: "editor-edit-area",
		width: "100%",
		height: "100%",
		wrapMode: "none",
		textColor: d.fg,
		focusedTextColor: d.fg,
		backgroundColor: d.bg,
		focusedBackgroundColor: d.bg,
		cursorColor: d.accent,
		syntaxStyle: style,
		keyBindings: KEY_BINDINGS,
		onContentChange: () => {
			if (!applying) handlers.onChange();
		},
	});
	area.onKeyDown = handlers.onKey;
	const gutter = new LineNumberRenderable(renderer, {
		id: "editor-edit",
		target: area,
		fg: d.faint,
		width: "100%",
		flexGrow: 1,
		visible: false,
	});
	gutter.setGutterLayout({ minWidth: 0, paddingLeft: 1, paddingRight: 1, minDigits: 3, minAfterWidth: 2 });

	const set = (snapshot: EditSnapshot) => {
		applying = true;
		area.setText(snapshot.text);
		applying = false;
		area.cursorOffset = snapshot.cursor;
	};

	return {
		gutter,
		area,
		/** Loads `text` with the cursor at the start of the 1-based `line`. */
		load(text: string, line: number) {
			set({ text, cursor: 0 });
			area.gotoLine(Math.max(0, line - 1));
		},
		set,
		snapshot(): EditSnapshot {
			return { text: area.plainText, cursor: area.cursorOffset };
		},
		/** Moves the cursor `lines` rows down (negative: up), for page up / page down. */
		page(lines: number) {
			for (let i = 0; i < Math.abs(lines); i++) {
				if (lines < 0) area.moveCursorUp();
				else area.moveCursorDown();
			}
		},
	};
}
