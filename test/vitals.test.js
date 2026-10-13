import { test } from "node:test";
import assert from "node:assert/strict";
import { cpuPercent, mbps, memoryUsed, netBytes, pingTime, words } from "../src/vitals.js";

const core = (user, sys, idle) => ({ times: { user, nice: 0, sys, idle, irq: 0 } });

// The processor number is worked out from two readings, and it has to
// be the share of the time in between, not of all time since startup.
test("cpu is the busy share of the time between two looks", () => {
  const before = [core(1000, 500, 8000), core(2000, 100, 9000)];
  const after = [core(1300, 600, 8600), core(2000, 100, 10000)];
  // First core: 400 busy of 1000. Second: 0 busy of 1000. Together 20%.
  assert.equal(cpuPercent(before, after), 20);
});

// The very first look has nothing to compare against, and a Mac that
// didn't tick between looks would divide by zero.
test("cpu is 0 when no time has passed", () => {
  const same = [core(1, 1, 1)];
  assert.equal(cpuPercent(same, same), 0);
  assert.equal(cpuPercent([], same), 0);
});

// Real vm_stat output from my Mac, cut down. The answer is app memory
// (anonymous minus purgeable) plus wired plus compressed, times the
// page size, which is what Activity Monitor calls Memory Used.
test("memory used matches Activity Monitor's sum", () => {
  const text = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                                     4190.",
    "Pages wired down:                             126381.",
    "Pages purgeable:                               10149.",
    "Anonymous pages:                              333561.",
    "Pages occupied by compressor:                 384882.",
  ].join("\n");
  assert.equal(memoryUsed(text), (333561 - 10149 + 126381 + 384882) * 16384);
});

// If vm_stat ever prints something else, the key should show a dash,
// not "NaN GB".
test("memory is null when vm_stat makes no sense", () => {
  assert.equal(memoryUsed("command not found"), null);
});

// Real netstat rows from my Mac. Only the <Link#> row of each "en" card
// counts: the address rows repeat the same totals, and lo0 is the Mac
// talking to itself, which would double every local download.
test("network bytes count each en card once", () => {
  const text = [
    "Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll",
    "lo0        16384 <Link#1>                       1403559     0  758984393  1403559     0  758984393     0",
    "en1        1500  <Link#8>    36:86:5f:bf:21:00        0     0          0        0     0          0     0",
    "en0        1500  <Link#11>   4a:e6:5d:f6:f0:fa 30518852     0 6450673683  3494834     0 3555683417     0",
    "en0        1500  192.168.1     192.168.1.55      30518852     - 6450673683  3494834     - 3555683417     -",
    "awdl0      1500  <Link#13>   b2:0a:85:36:3c:5a     6778     0    2764629     3449     0    1067199     0",
  ].join("\n");
  assert.deepEqual(netBytes(text), { down: 6450673683, up: 3555683417 });
});

// 2.5 million bytes in 2 seconds is 10 megabits a second.
test("speed is megabits a second", () => {
  assert.equal(mbps(1_000_000, 3_500_000, 2), 10);
});

// When the network restarts its count goes back to zero, and without
// this the key would flash a huge negative speed.
test("a count that went backwards is 0, not a negative speed", () => {
  assert.equal(mbps(5_000_000, 100, 2), 0);
  assert.equal(mbps(0, 100, 0), 0);
});

// ping's real line, and what it prints when nothing answers.
test("ping time comes out of ping's reply, or null with no reply", () => {
  assert.equal(pingTime("64 bytes from 1.1.1.1: icmp_seq=0 ttl=55 time=19.250 ms"), 19.25);
  assert.equal(pingTime("1 packets transmitted, 0 packets received, 100.0% packet loss"), null);
});

// What ends up on the key. The number has to fit next to its unit, so
// a speed never shows more than three digits.
test("readings turn into short words with the right unit", () => {
  assert.deepEqual(words("cpu", 22.6), { value: "23", unit: "%" });
  assert.deepEqual(words("memory", 12 * 2 ** 30), { value: "12.0", unit: "GB" });
  assert.deepEqual(words("ping", 18.4), { value: "18", unit: "ms" });
  assert.deepEqual(words("down", 6.14), { value: "6.1", unit: "Mbps" });
  assert.deepEqual(words("down", 84.25), { value: "84", unit: "Mbps" });
  assert.deepEqual(words("down", 412.7), { value: "413", unit: "Mbps" });
  assert.deepEqual(words("down", 1240), { value: "1.2", unit: "Gbps" });
  assert.deepEqual(words("up", 0.0116), { value: "12", unit: "Kbps" });
  assert.deepEqual(words("up", 0), { value: "0", unit: "Kbps" });
  assert.deepEqual(words("ping", null), { value: "–", unit: "" });
});
