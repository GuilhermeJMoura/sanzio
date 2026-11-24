import { setDefaultTimeout } from "bun:test";

// PTY tests start a real TUI and a child process
setDefaultTimeout(20_000);
