import { BoxRenderable, type CliRenderer, type EmbeddedTerminalRenderable } from "@opentui/core";
import type { WorkspaceHandlers, WorkspaceViewModel } from "$types/workspace.ts";
import { createEditor } from "./editor.ts";
import { createExplorer } from "./explorer.ts";
import { createStatusLine } from "./statusline.ts";
import { theme } from "./theme.ts";

/** Explorer left, editor center, claude at the bottom, status line under it; claude alone in conversation mode. */
export function createWorkspaceView(
	renderer: CliRenderer,
	claude: { box: BoxRenderable; terminal: EmbeddedTerminalRenderable },
	handlers: WorkspaceHandlers,
) {
	const root = new BoxRenderable(renderer, {
		id: "workspace",
		width: "100%",
		height: "100%",
		flexDirection: "column",
		backgroundColor: theme.bg,
	});
	const work = new BoxRenderable(renderer, { id: "work", width: "100%", flexGrow: 1, flexDirection: "row" });
	const right = new BoxRenderable(renderer, { id: "work-right", flexGrow: 1, height: "100%", flexDirection: "column" });
	const explorer = createExplorer(renderer, {
		onItem: handlers.onExplorerItem,
		onFocus: () => handlers.onFocus("explorer"),
	});
	const editor = createEditor(renderer, {
		onFocus: () => handlers.onFocus("editor"),
		onOpenPending: handlers.onOpenPending,
		onDismiss: handlers.onDismiss,
		onTab: handlers.onTab,
		onEditAt: handlers.onEditAt,
		onEditKey: handlers.onEditKey,
		onEditChange: handlers.onEditChange,
		onConflict: handlers.onConflict,
		onPrompt: handlers.onPrompt,
	});
	const status = createStatusLine(renderer, {
		onToggleWorkspace: handlers.onToggleWorkspace,
		onToggleFollow: handlers.onToggleFollow,
	});

	claude.box.height = "auto";
	claude.box.flexGrow = 1;
	claude.box.flexShrink = 0;
	right.add(editor.box);
	right.add(claude.box);
	work.add(explorer.box);
	work.add(right);
	root.add(work);
	root.add(status.box);

	explorer.box.onKeyDown = (key) => handlers.onKey("explorer", key);
	editor.box.onKeyDown = (key) => handlers.onKey("editor", key);
	claude.box.onMouseDown = () => handlers.onFocus("claude");
	claude.terminal.on("focused", () => handlers.onFocus("claude"));

	return {
		root,
		scrollEditor: editor.scroll,
		editorTopLine: editor.topLine,
		editSurface: editor.surface,
		render(vm: WorkspaceViewModel) {
			explorer.box.visible = vm.visible;
			editor.box.visible = vm.visible;
			explorer.box.width = vm.sizes.explorerWidth;
			claude.box.flexGrow = vm.visible ? 0 : 1;
			claude.box.height = vm.visible ? vm.sizes.claudeHeight : "auto";
			claude.box.borderColor = vm.focus === "claude" ? theme.accent : theme.border;
			claude.box.titleColor = vm.focus === "claude" ? theme.accent : theme.strong;
			if (vm.visible) {
				explorer.update(vm.explorer);
				editor.update(vm.editor);
			}
			status.update(vm.status);

			const editorTarget = vm.editor.edit.active ? editor.surface.area : editor.box;
			const target = vm.focus === "explorer" ? explorer.box : vm.focus === "editor" ? editorTarget : claude.terminal;
			if (!target.focused) target.focus();
		},
	};
}
