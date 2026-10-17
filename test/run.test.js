import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMAND_MS, run } from "../src/run.js";

// The one rule every command shares: a command that hangs is given up
// on. The limit is passed in here so the test doesn't sit and wait.
test("a command that hangs is given up on at its limit", async () => {
  const started = Date.now();
  await assert.rejects(run("/bin/sleep", ["10"], { timeout: 100 }));
  assert.ok(Date.now() - started < 2000);
});

// A command that behaves just prints, the same as plain execFile.
test("a command that finishes gives back what it printed", async () => {
  const { stdout } = await run("/bin/echo", ["hello"]);
  assert.equal(stdout, "hello\n");
});

// The scutil question is typed in through the command's stdin, so the
// promise has to still carry the running command with it.
test("the running command is reachable for commands that need typing to", async () => {
  const asking = run("/bin/cat", []);
  asking.child.stdin.end("typed in\n");
  assert.equal((await asking).stdout, "typed in\n");
});

// A command nobody gave a limit to still gets one. This one waits out
// the real default, so it's the slow test in the file.
test("a command with no limit of its own gets the default", async () => {
  assert.ok(COMMAND_MS > 0 && COMMAND_MS <= 3000);
  const started = Date.now();
  await assert.rejects(run("/bin/sleep", ["10"]));
  assert.ok(Date.now() - started < COMMAND_MS + 1500);
});
