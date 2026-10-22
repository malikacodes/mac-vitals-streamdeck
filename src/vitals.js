// Reads the Mac's vital signs: how busy the processor is, how much
// memory is in use, whether the Mac is short of it, how fast data is
// moving, and how long the internet takes to answer. The top half is plain functions the tests can run.
// The bottom half asks the Mac.
import os from "node:os";
import { COMMAND_MS, run as runCommand } from "./run.js";

// The stats, in the order they sit on my deck. `top` is the top of the
// graph. The ones without it grow to fit whatever the last minute held,
// but never zoom in closer than `floor`, so an idle connection draws a
// flat line and not a mountain range made of nothing.
export const STATS = {
  cpu: { label: "CPU", top: 100 },
  // All the memory in the Mac.
  memory: { label: "MEMORY", top: os.totalmem() },
  pressure: { label: "PRESSURE", top: 100 },
  down: { label: "DOWN", floor: 1 },
  up: { label: "UP", floor: 1 },
  ping: { label: "PING", floor: 50 },
};

// How busy the processor was between two looks, 0 to 100.
//
// The Mac doesn't keep a "percent busy right now". Each core keeps
// running totals of time spent working and time spent idle since it
// started, like a car's odometer. Two readings a moment apart, and the
// share of the difference that wasn't idle, is the percent.
export function cpuPercent(before, after) {
  let busy = 0;
  let all = 0;
  for (let i = 0; i < after.length; i++) {
    const was = before[i]?.times;
    if (!was) continue;
    const now = after[i].times;
    const total = Object.keys(now).reduce((sum, k) => sum + now[k] - was[k], 0);
    all += total;
    busy += total - (now.idle - was.idle);
  }
  return all > 0 ? (busy / all) * 100 : 0;
}

// Memory in use, in bytes, from what `vm_stat` prints. It counts the
// same three things as "Memory Used" in Activity Monitor:
//   app memory   what my apps are holding (anonymous, minus the part
//                the Mac may throw away, called purgeable)
//   wired        what macOS itself can't give up
//   compressed   what's been squeezed to make room
// "Free" isn't used, because a Mac fills spare memory with cached files
// on purpose and would look full all day.
export function memoryUsed(text) {
  const page = Number(text.match(/page size of (\d+) bytes/)?.[1]);
  const pages = (name) => Number(text.match(new RegExp(`${name}:\\s+(\\d+)\\.`))?.[1]);
  const used =
    pages("Anonymous pages") - pages("Pages purgeable") + pages("Pages wired down") + pages("Pages occupied by compressor");
  return Number.isFinite(used * page) ? used * page : null;
}

// Memory pressure, from what `sysctl` prints for two kernel settings,
// one per line in the order asked:
//   kern.memorystatus_vm_pressure_level  the Mac's own call: 1 normal,
//                                        2 warning, 4 critical
//   kern.memorystatus_level              memory available, as a percent
// Returns { pressure, level }, where pressure is 100 minus available,
// so it goes up when things get worse like every other key. Half a
// reading is no reading: anything that doesn't make sense is null.
//
// This is what Activity Monitor's colored graph is about, and it's a
// better question than how full memory is. A Mac fills spare memory on
// purpose and gives it back when an app asks, so "used" can sit at 80%
// on a Mac that's perfectly fine (spec: docs/memory-pressure-key-prd.md).
export function pressure(text) {
  const [level, available] = String(text).trim().split("\n").map((line) => line.trim());
  if (![level, available].every((n) => /^\d+$/.test(n ?? ""))) return null;
  if (![1, 2, 4].includes(Number(level)) || Number(available) > 100) return null;
  return { pressure: 100 - Number(available), level: Number(level) };
}

// Bytes in and out so far, added up over the Mac's network cards, from
// what `netstat -ib` prints.
//
// Each card has several rows. The "<Link#" row is the card itself and
// the others repeat it per address, so only that row is counted. Only
// "en" cards count: that's Wi-Fi and Ethernet, and it leaves out the
// Mac talking to itself (lo0) and AirDrop (awdl0). The numbers are read
// from the right because the address column is sometimes missing.
export function netBytes(text) {
  let down = 0;
  let up = 0;
  for (const line of text.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (!/^en\d+$/.test(cols[0]) || !line.includes("<Link#")) continue;
    down += Number(cols.at(-5)) || 0;
    up += Number(cols.at(-2)) || 0;
  }
  return { down, up };
}

// Megabits a second between two byte counts taken `seconds` apart.
// Megabits, not megabytes, because that's the unit an internet plan is
// sold in: 8 bits to a byte.
export function mbps(before, after, seconds) {
  // After a restart of the network the count can start over from zero.
  if (seconds <= 0 || after < before) return 0;
  return ((after - before) * 8) / 1e6 / seconds;
}

// The reply time out of what `ping` prints, in milliseconds.
export function pingTime(text) {
  const time = text.match(/time=([\d.]+) ms/);
  return time ? Number(time[1]) : null;
}

// A reading as the words on the key: a number and its unit. null means
// there's nothing to show yet, or no reply.
export function words(stat, value) {
  if (value == null) return { value: "–", unit: "" };
  if (stat === "cpu" || stat === "pressure") return { value: String(Math.round(value)), unit: "%" };
  if (stat === "memory") return { value: (value / 2 ** 30).toFixed(1), unit: "GB" };
  if (stat === "ping") return { value: String(Math.round(value)), unit: "ms" };
  // Speeds. The number has to fit beside its unit, so it never gets
  // more than three digits: kilobits under 1 Mbps (it would sit at
  // "0.0" most of the day otherwise), one decimal under 10, and
  // gigabits at 1000.
  if (value < 0.95) return { value: String(Math.round(value * 1000)), unit: "Kbps" };
  if (value < 9.95) return { value: value.toFixed(1), unit: "Mbps" };
  if (value < 999.5) return { value: String(Math.round(value)), unit: "Mbps" };
  return { value: (value / 1000).toFixed(1), unit: "Gbps" };
}

// The last thing I looked at, to compare the next look against.
let last = null;

// A look older than this isn't compared against. The keys stop looking
// when none are on screen, so after a while away the last look is
// minutes old, and the traffic since would show up as one huge speed.
// A slow tick takes a few seconds at most, so ten is well clear of one.
const STALE_MS = 10_000;

// The commands that failed last time, so a command that keeps failing
// is written to the log once, when it starts, and not every two seconds.
const failing = new Set();

// One look at everything. Returns { cpu, memory, pressure, down, up,
// ping } plus pressureLevel, with null for anything that couldn't be
// read this time. The first look has
// nothing to compare against, so cpu and the speeds start as null.
//
// `run` is how the commands get run. The tests hand in a fake one that
// prints saved output, so they can try a dead network without one.
// `log` is where a command that stopped answering gets written down.
export async function readVitals({ run = runCommand, log = () => {} } = {}) {
  const now = { at: Date.now(), cores: os.cpus(), net: null };
  const [vm, sysctl, net, ping] = await Promise.allSettled([
    run("/usr/bin/vm_stat", [], { timeout: COMMAND_MS }),
    // Never memory_pressure for this. It prints the same percent, but
    // its options make real memory pressure or fake it for the whole Mac.
    run("/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level", "kern.memorystatus_level"], { timeout: COMMAND_MS }),
    run("/usr/sbin/netstat", ["-ib"], { timeout: COMMAND_MS }),
    // One small packet to Cloudflare's 1.1.1.1, giving up after 2 seconds.
    run("/sbin/ping", ["-c", "1", "-t", "2", "1.1.1.1"], { timeout: COMMAND_MS }),
  ]);
  if (net.status === "fulfilled") now.net = netBytes(net.value.stdout);

  // sysctl can answer and still say something I can't read, like a
  // pressure level the kernel never used to have. That counts as a
  // failure too, or the key would show a dash with nothing in the log.
  const squeeze = sysctl.status === "fulfilled" ? pressure(sysctl.value.stdout) : null;
  const unreadable = sysctl.status === "fulfilled" && !squeeze ? `printed ${JSON.stringify(sysctl.value.stdout.trim())}` : null;

  // ping fails whenever the internet is out, which is a reading and not
  // a problem, so only the others are worth a line in the log.
  const problems = [
    ["vm_stat", vm.status === "rejected" ? vm.reason.message : null],
    ["sysctl", sysctl.status === "rejected" ? sysctl.reason.message : unreadable],
    ["netstat", net.status === "rejected" ? net.reason.message : null],
  ];
  for (const [name, problem] of problems) {
    if (problem && !failing.has(name)) {
      failing.add(name);
      log(`${name} stopped answering: ${problem}`);
    } else if (!problem && failing.delete(name)) {
      log(`${name} is answering again`);
    }
  }

  const before = last && now.at - last.at >= 0 && now.at - last.at < STALE_MS ? last : null;
  const seconds = before ? (now.at - before.at) / 1000 : 0;
  const speed = (way) => (before?.net && now.net ? mbps(before.net[way], now.net[way], seconds) : null);
  const vitals = {
    cpu: before ? cpuPercent(before.cores, now.cores) : null,
    memory: vm.status === "fulfilled" ? memoryUsed(vm.value.stdout) : null,
    pressure: squeeze?.pressure ?? null,
    pressureLevel: squeeze?.level ?? null,
    down: speed("down"),
    up: speed("up"),
    // ping exits with an error when nothing answers, which is an answer
    // of its own: no reply.
    ping: ping.status === "fulfilled" ? pingTime(ping.value.stdout) : null,
  };
  last = now;
  return vitals;
}
