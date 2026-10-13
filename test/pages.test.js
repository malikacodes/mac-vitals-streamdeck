import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deckChoices, whereToOpen } from "../src/pages.js";

const xl = { id: "xl-1", type: 2, isConnected: true };
const plus = { id: "plus-1", type: 7, isConnected: true };
const mini = { id: "mini-1", type: 1, isConnected: true };

// A key I've never opened the settings of has no choice saved at all,
// and it should behave the way it did before there was a menu.
test("with nothing picked, the page opens on the key's own deck", () => {
  assert.deepEqual(whereToOpen(undefined, xl, [xl, plus]), { deck: "xl-1", profile: "profiles/mac-vitals-xl" });
  assert.deepEqual(whereToOpen("here", plus, [xl, plus]), { deck: "plus-1", profile: "profiles/mac-vitals-plus" });
});

// The reason the menu exists: Memory sits on my XL's Home page and
// opens the page on my +. The + has to get the + layout, not the XL's.
test("a key on one deck can open the page on the other", () => {
  assert.deepEqual(whereToOpen("7", xl, [xl, plus]), { deck: "plus-1", profile: "profiles/mac-vitals-plus" });
  assert.deepEqual(whereToOpen("2", plus, [xl, plus]), { deck: "xl-1", profile: "profiles/mac-vitals-xl" });
});

// An unplugged deck can't be switched, and neither can a deck I have
// no layout for. Both get the yellow triangle, not a crash or a switch
// on the wrong deck.
test("an unplugged deck or a deck with no layout is a no", () => {
  assert.equal(whereToOpen("7", xl, [xl, { ...plus, isConnected: false }]), null);
  assert.equal(whereToOpen("7", xl, [xl]), null);
  assert.equal(whereToOpen("here", mini, [mini, xl]), null);
});

// Settings are typed-in text as far as the plugin is concerned. Junk in
// there means "here", it doesn't pick some other deck.
test("a saved choice that makes no sense means the key's own deck", () => {
  assert.equal(whereToOpen("banana", xl, [xl, plus]).deck, "xl-1");
  assert.equal(whereToOpen("1", xl, [xl, plus, mini]).deck, "xl-1");
});

// The menu only offers what a press could really do right now.
test("the menu lists this deck, then each plugged-in deck with a layout", () => {
  assert.deepEqual(deckChoices([plus, xl, mini, { ...plus, id: "plus-2", isConnected: false }]), [
    { value: "here", label: "The deck this key is on" },
    { value: "2", label: "Stream Deck XL" },
    { value: "7", label: "Stream Deck +" },
  ]);
  assert.equal(deckChoices([]).length, 1);
});

// The page names here have to be ones the manifest really lists, or the
// press asks Stream Deck for a page that doesn't exist.
test("every page a press can open is in the manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../com.malikacodes.mac-vitals.sdPlugin/manifest.json", import.meta.url), "utf8"));
  for (const deck of [xl, plus]) {
    const { profile } = whereToOpen("here", deck, [deck]);
    const listed = manifest.Profiles.find((p) => p.Name === profile);
    assert.equal(listed?.DeviceType, deck.type);
  }
});
