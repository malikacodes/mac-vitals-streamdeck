// Runs one of the Mac's commands and gives back what it printed.
//
// Every command gets a time limit. While the Wi-Fi is changing
// networks, netstat and friends can sit waiting for a card that's
// halfway between networks, and a reading that never comes back is
// worse than a dash. Three seconds leaves room for ping's own two
// second limit. A caller that really needs longer (joining a network
// can take a while) says so in its options.
//
// The promise it gives back still carries `.child`, because scutil has
// to be typed to.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const COMMAND_MS = 3000;

const exec = promisify(execFile);

export const run = (file, args = [], options = {}) => exec(file, args, { timeout: COMMAND_MS, ...options });
