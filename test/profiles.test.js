import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEVICES, PROFILES, profileFiles } from "../scripts/profiles.mjs";

const manifest = JSON.parse(readFileSync(new URL("../com.malikacodes.mac-vitals.sdPlugin/manifest.json", import.meta.url), "utf8"));

// A key placed off the edge of the deck, or two keys on one spot, makes
// a profile that imports with a key quietly missing.
test("every key is on the deck and no spot is used twice", () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    const { columns, rows } = DEVICES[profile.device];
    const spots = new Set();
    for (const [column, row] of profile.keys) {
      assert.ok(column >= 0 && column < columns && row >= 0 && row < rows, `${name} has a key at ${column},${row}`);
      assert.ok(!spots.has(`${column},${row}`), `${name} uses ${column},${row} twice`);
      spots.add(`${column},${row}`);
    }
  }
});

// The profiles are how a new install gets its keys, so each one has to
// carry every action the plugin has. A key I add later and forget to
// place would never show up for anyone.
test("each profile has every action in the manifest", () => {
  const all = manifest.Actions.map((a) => a.UUID).sort();
  for (const name of Object.keys(PROFILES)) {
    const page = Object.entries(profileFiles(name, manifest)).find(([, file]) => file.Controllers?.[0].Actions)[1];
    const placed = Object.values(page.Controllers[0].Actions).map((a) => a.UUID).filter((id) => id.startsWith(manifest.UUID));
    assert.deepEqual(placed.sort(), all, name);
  }
});

// The manifest tells Stream Deck which deck each profile is for. If it
// disagrees with the profile file, the XL layout lands on the + or
// nowhere.
test("the manifest lists each profile for the right deck", () => {
  for (const [name, profile] of Object.entries(PROFILES)) {
    const listed = manifest.Profiles.find((p) => p.Name === `profiles/${name}`);
    assert.ok(listed, `${name} isn't in the manifest`);
    assert.equal(listed.DeviceType, DEVICES[profile.device].type);
  }
});

// My network names stay out of the repo, so the Wi-Fi key ships empty.
test("the Wi-Fi key ships with no networks in it", () => {
  for (const name of Object.keys(PROFILES)) {
    assert.ok(!JSON.stringify(profileFiles(name, manifest)).includes("networks"));
  }
});
