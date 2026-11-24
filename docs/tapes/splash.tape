Output ../media/splash.gif
Source "common.tape"
Hide
Type "unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_CHILD_NOTES_DIR CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT CLAUDE_PID MAESTRI_CLI MAESTRI_SOCKET MAESTRI_TERMINAL_ID" Enter
Type "cd ~/Code/sanzio-demo && git checkout -q -- . && clear" Enter
Sleep 500ms
Show
Type "sanzio --model haiku" Sleep 300ms Enter
Wait+Screen@15s /Sanzio/
Sleep 700ms
Screenshot ../media/splash.png
Sleep 1.5s
Wait+Screen@30s /Claude Code/
Sleep 2s
Hide
Ctrl+C
Sleep 300ms
Ctrl+C
Sleep 1s
