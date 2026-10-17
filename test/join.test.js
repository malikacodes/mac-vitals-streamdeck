import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "../src/wifi.js";

const SECRET = "hunter2-correct-horse";
const ports = "Hardware Port: Wi-Fi\nDevice: en0\n";

// A stand-in for the Mac's commands. `security` and `networksetup`
// each get a script: text to print, or an error to fail with.
function fakeRun({ security, said = "", fails } = {}) {
  const calls = [];
  const run = async (file, args, opts) => {
    calls.push({ file, args, opts });
    if (file.endsWith("networksetup") && args[0] === "-listallhardwareports") return { stdout: ports };
    if (file.endsWith("security")) {
      if (security instanceof Error) throw security;
      return { stdout: `${security}\n` };
    }
    if (fails) throw fails;
    return { stdout: said };
  };
  run.calls = calls;
  return run;
}
const joining = (run) => run.calls.find((c) => c.args[0] === "-setairportnetwork");
// What `security` does when nothing is filed under that name, and when
// the keychain is locked. Node puts the exit code on the error.
const notFound = Object.assign(new Error("Command failed: security find-generic-password"), { code: 44 });
const locked = Object.assign(new Error("Command failed: security find-generic-password"), { code: 36 });

test("joins with the saved password", async () => {
  const run = fakeRun({ security: SECRET });
  await join("Upstairs", { run });
  assert.deepEqual(joining(run).args, ["-setairportnetwork", "en0", "Upstairs", SECRET]);
  assert.equal(joining(run).opts.timeout, 30000);
});

// A network I never saved a password for is still tried, without one.
test("no saved password joins without one", async () => {
  const run = fakeRun({ security: notFound });
  await join("Upstairs", { run });
  assert.deepEqual(joining(run).args, ["-setairportnetwork", "en0", "Upstairs"]);
});

// networksetup prints a reason when it can't join. Without a saved
// password that reason is a "no password" problem, which sends me to
// Terminal; with one, it isn't.
test("a reason from networksetup is the thrown text, and says if there was no password", async () => {
  const reason = "Failed to join network Upstairs.";
  await assert.rejects(join("Upstairs", { run: fakeRun({ security: notFound, said: reason }) }), (err) => err.message === reason && err.noPassword === true);
  await assert.rejects(join("Upstairs", { run: fakeRun({ security: SECRET, said: reason }) }), (err) => err.message === reason && err.noPassword === false);
});

// A locked keychain is not "no password". Sending me to Terminal to
// save one I already saved would be the wrong help.
test("a locked keychain is not read as no password, and nothing is joined", async () => {
  const run = fakeRun({ security: locked });
  await assert.rejects(join("Upstairs", { run }), (err) => err.noPassword !== true && !err.message.includes(SECRET));
  assert.equal(joining(run), undefined, "no attempt to join without the password");
});

// The thrown text ends up in the log file. Neither failure path may
// carry the password in it: not Node's "Command failed" text, which
// repeats the command, and not a reason that echoes it back.
test("the password is never in the thrown text", async () => {
  const echoed = Object.assign(new Error(`Command failed: networksetup -setairportnetwork en0 Upstairs ${SECRET}`), { stdout: SECRET });
  await assert.rejects(join("Upstairs", { run: fakeRun({ security: SECRET, fails: echoed }) }), (err) => !err.message.includes(SECRET));
  await assert.rejects(join("Upstairs", { run: fakeRun({ security: SECRET, said: `Could not join with ${SECRET}` }) }), (err) => !err.message.includes(SECRET));
});

// A keychain lookup that hung is killed by its time limit, which Node
// reports with no exit code at all. That's "I don't know", the same as locked.
test("a keychain lookup that timed out is not read as no password", async () => {
  const hung = Object.assign(new Error("Command failed"), { code: null, killed: true });
  await assert.rejects(join("Upstairs", { run: fakeRun({ security: hung }) }), (err) => err.noPassword !== true);
});
