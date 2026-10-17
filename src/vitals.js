// Reads the Mac's vital signs: how busy the processor is, how much
// memory is in use, how fast data is moving, and how long the internet
// takes to answer. The top half is plain functions the tests can run.
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
  if (stat === "cpu") return { value: String(Math.round(value)), unit: "%" };
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

// The commands that failed last time, so a command that keeps failing
// is written to the log once, when it starts, and not every two seconds.
const failing = new Set();

// One look at everything. Returns { cpu, memory, down, up, ping }, with
// null for anything that couldn't be read this time. The first look has
// nothing to compare against, so cpu and the speeds start as null.
//
// `run` is how the commands get run. The tests hand in a fake one that
// prints saved output, so they can try a dead network without one.
// `log` is where a command that stopped answering gets written down.
export async function readVitals({ run = runCommand, log = () => {} } = {}) {
  const now = { at: Date.now(), cores: os.cpus(), net: null };
  const [vm, net, ping] = await Promise.allSettled([
    run("/usr/bin/vm_stat", [], { timeout: COMMAND_MS }),
    run("/usr/sbin/netstat", ["-ib"], { timeout: COMMAND_MS }),
    // One small packet to Cloudflare's 1.1.1.1, giving up after 2 seconds.
    run("/sbin/ping", ["-c", "1", "-t", "2", "1.1.1.1"], { timeout: COMMAND_MS }),
  ]);
  if (net.status === "fulfilled") now.net = netBytes(net.value.stdout);

  // ping fails whenever the internet is out, which is a reading and not
  // a problem, so only the other two are worth a line in the log.
  for (const [name, result] of [["vm_stat", vm], ["netstat", net]]) {
    if (result.status === "rejected" && !failing.has(name)) {
      failing.add(name);
      log(`${name} stopped answering: ${result.reason.message}`);
    } else if (result.status === "fulfilled" && failing.delete(name)) {
      log(`${name} is answering again`);
    }
  }

  const seconds = last ? (now.at - last.at) / 1000 : 0;
  const speed = (way) => (last?.net && now.net ? mbps(last.net[way], now.net[way], seconds) : null);
  const vitals = {
    cpu: last ? cpuPercent(last.cores, now.cores) : null,
    memory: vm.status === "fulfilled" ? memoryUsed(vm.value.stdout) : null,
    down: speed("down"),
    up: speed("up"),
    // ping exits with an error when nothing answers, which is an answer
    // of its own: no reply.
    ping: ping.status === "fulfilled" ? pingTime(ping.value.stdout) : null,
  };
  last = now;
  return vitals;
}
