Output ../media/follow.gif
Source "common.tape"
Hide
Type "unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_CHILD_NOTES_DIR CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT CLAUDE_PID MAESTRI_CLI MAESTRI_SOCKET MAESTRI_TERMINAL_ID" Enter
Type "cd ~/Code/sanzio-demo && git checkout -q -- . && clear" Enter
Sleep 500ms
Type "sanzio --model haiku" Enter
Wait+Screen@20s /SEGUINDO/
Sleep 2s
Show
Type@40ms "In src/palette.ts add a lapis pigment #26619c, then use it as the default in src/fresco.ts. Be brief."
Sleep 400ms
Enter
Wait+Screen@120s /claude editou/
Wait+Screen@120s /fresco\.ts/
Sleep 6s
Ctrl+E
Sleep 2s
Ctrl+E
Sleep 3s
Hide
Ctrl+E
Sleep 300ms
Type "/exit" Enter
Sleep 2s
