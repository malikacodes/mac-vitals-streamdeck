import { test } from "node:test";
import assert from "node:assert/strict";
import { hasName, nextNetwork, parseAirport, parseNetworks, whichNetwork } from "../src/wifi.js";

// A stand-in for the Mac's scan record: some bytes, then each name
// stored the way a binary property list stores text, tag first.
function record(...names) {
  const parts = [Buffer.from("bplist00")];
  for (const name of names) {
    const plain = /^[\x00-\x7f]*$/.test(name);
    const kind = plain ? 0x50 : 0x60;
    parts.push(Buffer.from(name.length < 15 ? [kind + name.length] : [kind + 15, 0x10, name.length]));
    parts.push(plain ? Buffer.from(name, "latin1") : Buffer.from(name, "utf16le").swap16());
  }
  return Buffer.concat(parts);
}

// The settings box is typed by hand, so blank lines, stray spaces and
// the same name twice all have to come out clean.
test("the settings box becomes a tidy list", () => {
  assert.deepEqual(parseNetworks("  Upstairs \n\nDownstairs-5G = Down\nUpstairs\n"), [
    { name: "Upstairs", label: "Upstairs" },
    { name: "Downstairs-5G", label: "Down" },
  ]);
});

// A brand new key has no settings, and those arrive as undefined.
test("no settings means no networks", () => {
  assert.deepEqual(parseNetworks(undefined), []);
  assert.deepEqual(parseNetworks(""), []);
});

// The press: on to the next one, round to the top after the last, and
// start at the top when the Mac is somewhere that isn't in the list.
test("a press goes to the next network and wraps", () => {
  const list = parseNetworks("A\nB\nC");
  assert.equal(nextNetwork(list, "A").name, "B");
  assert.equal(nextNetwork(list, "C").name, "A");
  assert.equal(nextNetwork(list, null).name, "A");
  assert.equal(nextNetwork(list, "Coffee shop").name, "A");
  assert.equal(nextNetwork([], "A"), null);
});

// This is the real shape of what scutil prints, cut down.
test("power and the scan record come out of scutil's answer", () => {
  const text = [
    "<dictionary> {",
    "  CHANNEL : 44",
    `  CachedScanRecord : <data> 0x${record("Upstairs").toString("hex")}`,
    "  Power Status : TRUE",
    "  SSID_STR : ",
    "}",
  ].join("\n");
  const { power, record: found } = parseAirport(text);
  assert.equal(power, true);
  assert.equal(whichNetwork(found, parseNetworks("Garden\nUpstairs")), "Upstairs");
});

// With Wi-Fi off there's no record at all, and that mustn't crash.
test("Wi-Fi off has no record", () => {
  const { power, record: found } = parseAirport("<dictionary> {\n  Power Status : FALSE\n}");
  assert.equal(power, false);
  assert.equal(found, null);
  assert.equal(whichNetwork(found, parseNetworks("Upstairs")), null);
});

// Two of my networks start with the same word. A plain "is this text
// in there" check would say I'm on "Office" while I'm on "Office 5G".
test("a name only matches whole, not as part of a longer one", () => {
  const rec = record("Office 5G");
  assert.equal(hasName(rec, "Office 5G"), true);
  assert.equal(hasName(rec, "Office"), false);
  assert.equal(hasName(rec, "Office 5"), false);
  assert.equal(hasName(rec, "ffice 5G"), false);
});

// Long names and names with a curly ’ in them are stored differently
// from short plain ones, and both are in my saved list.
test("long names and names with a curly apostrophe are found", () => {
  assert.equal(hasName(record("Downstairs-Guest-5G"), "Downstairs-Guest-5G"), true);
  assert.equal(hasName(record("Sam’s iPhone"), "Sam’s iPhone"), true);
  assert.equal(hasName(record("Sam’s iPhone"), "Sam's iPhone"), false);
});
