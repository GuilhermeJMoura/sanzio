export interface ClaudeLaunch {
	command: string;
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}
