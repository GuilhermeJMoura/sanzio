# Sanzio

A terminal workspace for coding with Claude Code. Type `sanzio` instead of `claude`: the real Claude Code runs in a pane, and beside it an explorer and an editor follow every file the agent edits, live.

Named after Raffaello Sanzio, whose workshop was the largest of the Renaissance: a master and many hands painting together.

## What it does

- **Real Claude Code inside.** Your `claude`, with your skills, plugins, hooks and statusline. Keys, paste, images and mouse pass through.
- **Follow the agent.** When Claude edits a file (Edit, Write or a Bash `sed`), the editor opens it in a diff and marks the new lines `◂ claude`. Click another file to pause, press `f` to resume.
- **Conversation mode.** No edits yet? Only Claude is on screen. `ctrl+e` shows or hides the explorer and editor at any time.
- **Edit from the panel.** `i` to edit, `ctrl+s` to save, `ctrl+z` / `ctrl+y` to undo and redo. If Claude changes the file you are editing, you choose: reload, keep yours, or see its diff.
- **Renaissance look.** Two themes, `verniz` (dark, default) and `pergaminho` (light), applied to Claude Code too, for Sanzio sessions only.

## Install

Requires [Bun](https://bun.sh) 1.3.5+ and [Claude Code](https://code.claude.com).

```sh
npm i -g sanzio
sanzio
```

Or with Bun: `bun add -g sanzio`.

From source:

```sh
git clone https://github.com/GuilhermeJMoura/sanzio
cd sanzio
bun install
bun link
```

Every argument is passed to `claude` (`sanzio -c`, `sanzio --resume <id>`).

## Theme

`SANZIO_THEME=pergaminho sanzio`, or `~/.config/sanzio/config.json`:

```json
{ "theme": "pergaminho" }
```

The environment variable wins over the file. Sanzio never writes your Claude Code settings: its hooks and theme are passed with `--settings` and `--plugin-dir` for that session only.

## Credits

The splash portrait is Raphael's self-portrait (c. 1506, Uffizi Gallery), public domain, via Wikimedia Commons.

## License

MIT
