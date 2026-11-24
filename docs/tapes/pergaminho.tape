Output ../media/pergaminho.gif
Source "common.tape"
Set Theme { "name": "pergaminho", "background": "#efe3c4", "foreground": "#3b2a17", "cursor": "#8f2112", "selection": "#c9b98f", "black": "#3b2a17", "red": "#8f2112", "green": "#3f5f1f", "yellow": "#6a4204", "blue": "#1f4a8f", "magenta": "#7a2f5a", "cyan": "#1f5f5a", "white": "#efe3c4", "brightBlack": "#7f6a40", "brightRed": "#a8321f", "brightGreen": "#4f7427", "brightYellow": "#7a4f08", "brightBlue": "#2a5ca8", "brightMagenta": "#8f3f6a", "brightCyan": "#2a7068", "brightWhite": "#fbf3dc" }
Hide
Type "unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_CHILD_NOTES_DIR CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT CLAUDE_PID MAESTRI_CLI MAESTRI_SOCKET MAESTRI_TERMINAL_ID" Enter
Type "cd ~/Code/sanzio-demo && git checkout -q -- . && clear" Enter
Sleep 500ms
Show
Type "SANZIO_THEME=pergaminho sanzio --model haiku" Sleep 300ms Enter
Wait+Screen@15s /Sanzio/
Sleep 1.5s
Wait+Screen@20s /SEGUINDO/
Sleep 1s
Type@40ms "In src/palette.ts add a sienna pigment #a0522d. Be brief."
Sleep 300ms
Enter
Wait+Screen@120s /claude editou/
Sleep 6s
Hide
Ctrl+E
Sleep 300ms
Type "/exit" Enter
Sleep 2s
