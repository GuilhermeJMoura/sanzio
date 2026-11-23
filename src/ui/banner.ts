import { BoxRenderable, type CliRenderer, TextRenderable } from "@opentui/core";
import type { Segment } from "$types/workspace.ts";
import { DRACULA, styled } from "./theme.ts";

const d = DRACULA;

/** A one-row notice in the editor with clickable buttons on the right; the first button is the primary one. */
export function createBanner(renderer: CliRenderer, id: string, buttons: { label: string; onClick: () => void }[]) {
	const box = new BoxRenderable(renderer, {
		id,
		width: "100%",
		height: 1,
		flexShrink: 0,
		flexDirection: "row",
		backgroundColor: d.accentBg,
		visible: false,
	});
	const text = new TextRenderable(renderer, { flexGrow: 1, flexShrink: 1, wrapMode: "none" });
	box.add(text);
	const labels = buttons.map((button, i) => {
		const node = new TextRenderable(renderer, { id: `${id}-${i}`, flexShrink: 0, wrapMode: "none" });
		node.onMouseDown = (event) => {
			event.stopPropagation();
			// no auto-focus on the editor box: the edit surface keeps the keys
			event.preventDefault();
			button.onClick();
		};
		box.add(node);
		return node;
	});
	const paint = (names: string[]) => {
		labels.forEach((node, i) => {
			const label = names[i] ?? "";
			node.content = styled(
				i === 0
					? [{ text: ` ${label} `, fg: d.bg, bg: d.accent, bold: true }]
					: [{ text: " " }, { text: ` ${label} `, fg: d.dim, bg: d.line2 }],
			);
		});
	};
	paint(buttons.map((b) => b.label));
	return {
		box,
		show(visible: boolean, message: Segment[] = [], names?: string[]) {
			box.visible = visible;
			if (!visible) return;
			text.content = styled(message);
			if (names) paint(names);
		},
	};
}
