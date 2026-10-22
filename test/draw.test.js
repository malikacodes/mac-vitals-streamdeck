import { test } from "node:test";
import assert from "node:assert/strict";
import { drawKey, drawStat, fit, HISTORY } from "../src/draw.js";

const networks = [
  { name: "Upstairs", label: "Upstairs" },
  { name: "Downstairs-5G-Long", label: "Down" },
  { name: "Garden", label: "Garden" },
];
const on = (name) => ({ power: true, connected: true, name });

// How many dots are lit, and which one, read back out of the picture.
function litDots(svg) {
  const dots = [...svg.matchAll(/<circle cx="[\d.]+" cy="126" r="4" fill="(#\w+)"\/>/g)].map((m) => m[1]);
  return dots.map((fill) => (fill === "#ffffff" ? "o" : ".")).join("");
}

// The deck is pure black, so anything else is a gray square.
test("the background is pure black in every state", () => {
  const states = [{}, { networks }, { networks, wifi: on("Garden") }, { networks, joining: "Garden" }, { networks, notice: "Can't join" }];
  for (const state of states) {
    assert.ok(drawKey(state).includes('<rect width="144" height="144" fill="#000000"/>'));
  }
  for (const state of [{}, { label: "CPU", value: "23", unit: "%", history: [1, 50, 99] }]) {
    assert.ok(drawStat(state).includes('<rect width="144" height="144" fill="#000000"/>'));
  }
});

// A name like "Q&A <guest>" would otherwise make a broken picture, and
// Stream Deck shows a broken picture as a blank key.
test("a name with & and < in it is escaped", () => {
  const svg = drawKey({ networks: [{ name: "x", label: "Q&A <x>" }], wifi: on("x") });
  assert.ok(svg.includes("Q&amp;A &lt;x&gt;"));
  assert.ok(!svg.includes("<x>"));
});

// A brand new key has no settings at all, and has to say what it needs.
test("a key with no networks asks for them", () => {
  assert.ok(drawKey().includes(">Add networks<"));
  assert.ok(drawKey({ networks: [] }).includes(">Add networks<"));
});

// The whole point of the key: the short name of the network I'm on, and
// its dot lit so I know what the next press goes to.
test("it shows the network I'm on and lights its dot", () => {
  const svg = drawKey({ networks, wifi: on("Downstairs-5G-Long") });
  assert.ok(svg.includes('fill="#ffffff">Down<'));
  assert.equal(litDots(svg), ".o.");
});

// While joining, the name is up but no dot is lit yet, because a lit
// dot means the Mac is really there.
test("joining shows where it's going without claiming to be there", () => {
  const svg = drawKey({ networks, wifi: on("Upstairs"), joining: "Garden" });
  assert.ok(svg.includes(">Garden<"));
  assert.equal(litDots(svg), "...");
  assert.ok(svg.includes('stroke="#5c5c62"'));
});

// Off, out of range and "on something else" each say so, and none of
// them lights a dot.
test("off, no network and another network are told apart", () => {
  const off = drawKey({ networks, wifi: { power: false, connected: false, name: null } });
  const none = drawKey({ networks, wifi: { power: true, connected: false, name: null } });
  const other = drawKey({ networks, wifi: on(null) });
  assert.ok(off.includes(">Wi-Fi off<"));
  assert.ok(none.includes(">No Wi-Fi<"));
  assert.ok(other.includes(">Other Wi-Fi<"));
  for (const svg of [off, none, other]) assert.equal(litDots(svg), "...");
});

// Two keys can have different lists. A key that doesn't have the
// network being joined used to have nothing to look up and would crash.
test("a join that isn't in this key's list leaves the key as it was", () => {
  const svg = drawKey({ networks, wifi: on("Upstairs"), joining: "Somewhere else" });
  assert.ok(svg.includes(">Upstairs<"));
  assert.equal(litDots(svg), "o..");
});

// A notice replaces the name, it doesn't draw on top of it.
test("a notice takes over the words", () => {
  const svg = drawKey({ networks, wifi: on("Garden"), notice: "Can't join" });
  assert.ok(svg.includes(">Can't join<"));
  assert.ok(!svg.includes(">Garden<"));
});

// A long name shrinks first and only then gets cut, and it never goes
// smaller than I can read on the deck.
test("a long name shrinks, then gets cut with a …", () => {
  assert.deepEqual(fit("Home"), { size: 24, text: "Home" });
  assert.equal(fit("Office 2.4G").size, 20);
  const long = fit("An Extremely Long Network Name");
  assert.equal(long.size, 17);
  assert.ok(long.text.endsWith("…"));
  assert.ok(long.text.length * long.size * 0.58 <= 128);
});

// Where the graph's line goes, read back out of the picture as a list
// of [x, y] pairs.
function line(svg) {
  const d = svg.match(/<path d="M([^"]+)"/)?.[1];
  return d ? d.split(" L").map((pair) => pair.split(" ").map(Number)) : [];
}

// The graph has to stay inside its strip at the bottom of the key. A
// reading over the top (a speed spike before the scale catches up) or
// under zero would otherwise draw over the number or off the key.
test("the graph stays inside its strip, whatever the readings", () => {
  const points = line(drawStat({ history: [0, 50, 100, 250, -20], top: 100 }));
  assert.deepEqual(points.map(([, y]) => y), [128, 112, 96, 96, 128]);
});

// The newest reading sits at the right edge and the line grows to the
// left, so a key that just appeared shows a short line, not two points
// stretched across the whole key.
test("the newest reading is at the right edge", () => {
  const two = line(drawStat({ history: [10, 20], top: 100 }));
  assert.equal(two.at(-1)[0], 130);
  assert.equal(two[0][0], 126);
  const full = line(drawStat({ history: Array(HISTORY + 5).fill(10), top: 100 }));
  assert.equal(full.length, HISTORY);
  assert.equal(full[0][0], 14);
});

// A missed reading (no ping reply) leaves a hole in the list. It's
// skipped, and it mustn't be drawn as a zero.
test("a missed reading is skipped, not drawn as zero", () => {
  const points = line(drawStat({ history: [50, null, 50], top: 100 }));
  assert.deepEqual(points.map(([, y]) => y), [112, 112]);
});

// One reading can't make a line. A lone dot of path would be an
// invalid drawing, and a broken picture is a blank key.
test("no line until there are two readings", () => {
  assert.ok(!drawStat({ history: [] }).includes("<path"));
  assert.ok(!drawStat({ history: [40] }).includes("<path"));
  assert.ok(drawStat().includes(">–<"));
});

// The pressure key's line color is its warning: pink at normal like the
// keys around it, yellow at warning, red at critical.
test("the pressure level colors the line", () => {
  const stroke = (level) => drawStat({ history: [30, 40], level }).match(/stroke="(#\w+)"/)[1];
  assert.equal(stroke(1), "#f2a7c3");
  assert.equal(stroke(2), "#f2c66d");
  assert.equal(stroke(4), "#d92b2b");
});

// Every other stat key is drawn without a level and has to stay pink.
// A level the drawing doesn't know is pink too, not a missing stroke.
test("no level, or an unknown one, draws pink", () => {
  assert.ok(drawStat({ history: [30, 40] }).includes('stroke="#f2a7c3"'));
  assert.ok(drawStat({ history: [30, 40], level: 3 }).includes('stroke="#f2a7c3"'));
});
