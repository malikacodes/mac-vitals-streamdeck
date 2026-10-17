import { test } from "node:test";
import assert from "node:assert/strict";
import { readVitals } from "../src/vitals.js";

// A stand-in for the Mac's commands. Each one either prints the text
// it's given or fails the way a real command would: by rejecting.
function fakeRun(outputs) {
  return async (file) => {
    const name = file.split("/").at(-1);
    const out = outputs[name];
    if (out instanceof Error) throw out;
    return { stdout: out ?? "", stderr: "" };
  };
}

const vmStat = (anonymous) =>
  [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages wired down:                             100000.",
    "Pages purgeable:                               10000.",
    `Anonymous pages:                              ${anonymous}.`,
    "Pages occupied by compressor:                 200000.",
  ].join("\n");

const netstat = (down, up) =>
  [
    "Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll",
    `en0        1500  <Link#11>   4a:e6:5d:f6:f0:fa 30518852     0 ${down}  3494834     0 ${up}     0`,
  ].join("\n");

const pingReply = "64 bytes from 1.1.1.1: icmp_seq=0 ttl=55 time=19.250 ms";

// The first look has nothing to compare against, so cpu and the speeds
// are a dash, and the second look turns the two counts into numbers.
test("two looks give every stat, the first look gives what it can", async () => {
  const first = await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), "netstat": netstat(1_000_000, 500_000), ping: pingReply }) });
  assert.equal(first.cpu, null);
  assert.equal(first.down, null);
  assert.equal(first.up, null);
  assert.equal(first.memory, (300000 - 10000 + 100000 + 200000) * 16384);
  assert.equal(first.ping, 19.25);

  // Two looks in the same millisecond would be no time apart at all.
  await new Promise((done) => setTimeout(done, 5));
  const second = await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(1_500_000, 600_000), ping: pingReply }) });
  assert.equal(typeof second.cpu, "number");
  assert.ok(second.cpu >= 0 && second.cpu <= 100);
  // More bytes than before, so a speed above zero. The exact number
  // depends on the clock, which this test doesn't control.
  assert.ok(second.down > 0);
  assert.ok(second.up > 0);
});

// After the Wi-Fi comes back the Mac's byte counts can start over, and
// the key should show 0 for that tick, not a giant negative speed.
test("a network count that started over reads as 0", async () => {
  await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(9_000_000, 9_000_000), ping: pingReply }) });
  const after = await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(100, 100), ping: pingReply }) });
  assert.equal(after.down, 0);
  assert.equal(after.up, 0);
});

// One command failing shouldn't take the whole reading down with it.
// Memory goes to a dash and the others still come through.
test("vm_stat failing leaves memory null and nothing thrown", async () => {
  const vitals = await readVitals({ run: fakeRun({ vm_stat: new Error("spawn vm_stat ENOENT"), netstat: netstat(1, 1), ping: pingReply }) });
  assert.equal(vitals.memory, null);
  assert.equal(vitals.ping, 19.25);
});

// ping exits with an error when nothing answers. That's the honest
// reading for an internet that's down: no reply, so null.
test("ping failing reads as no reply", async () => {
  const vitals = await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(1, 1), ping: new Error("Command failed: ping") }) });
  assert.equal(vitals.ping, null);
  assert.equal(typeof vitals.memory, "number");
});

// Each command gets a time limit, so a netstat that hangs during a
// Wi-Fi change is given up on instead of waited for forever.
test("every command is run with a time limit", async () => {
  const options = [];
  const run = async (file, args, opts) => {
    options.push(opts);
    return { stdout: "", stderr: "" };
  };
  await readVitals({ run });
  assert.equal(options.length, 3);
  for (const opts of options) assert.ok(opts.timeout > 0 && opts.timeout <= 3000);
});

// A command that fails every two seconds would fill the log with the
// same line. One line when it stops answering, one when it's back.
test("a command that keeps failing is logged once, and once when it recovers", async () => {
  const lines = [];
  const log = (line) => lines.push(line);
  const broken = fakeRun({ vm_stat: vmStat(300000), netstat: new Error("netstat: hung"), ping: pingReply });
  await readVitals({ run: broken, log });
  await readVitals({ run: broken, log });
  await readVitals({ run: broken, log });
  assert.deepEqual(lines, ["netstat stopped answering: netstat: hung"]);

  await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(1, 1), ping: pingReply }), log });
  assert.deepEqual(lines, ["netstat stopped answering: netstat: hung", "netstat is answering again"]);

  // No reply from the internet is a reading, not a fault, so it's quiet.
  await readVitals({ run: fakeRun({ vm_stat: vmStat(300000), netstat: netstat(1, 1), ping: new Error("no reply") }), log });
  assert.equal(lines.length, 2);
});
