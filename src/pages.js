// Which Mac Vitals page a press on a stat key opens, and on which deck.
// Plain functions: they're handed the decks and hand back an answer.

// The ready-made page for each kind of deck, by Stream Deck's number for
// it: 2 is the XL and 7 is the Stream Deck +. They're the two layouts
// scripts/profiles.mjs builds.
const PAGES = {
  2: { name: "Stream Deck XL", profile: "profiles/mac-vitals-xl" },
  7: { name: "Stream Deck +", profile: "profiles/mac-vitals-plus" },
};

// The rows for the "Open on" menu in a stat key's settings: the deck
// the key is on, then every plugged-in deck that has a page.
//
// A choice is saved as the kind of deck ("7"), not that deck's own id.
// The kind is what picks the layout, and it's still right after I plug
// the deck into a different port.
export function deckChoices(decks) {
  const kinds = [...new Set(decks.filter((deck) => deck.isConnected && PAGES[deck.type]).map((deck) => deck.type))];
  return [{ value: "here", label: "The deck this key is on" }, ...kinds.sort().map((kind) => ({ value: String(kind), label: PAGES[kind].name }))];
}

// Where a press should open the page: { deck, profile }, or null when
// it can't. That's a deck with no page of its own (a Mini), or one I
// picked that isn't plugged in right now.
//   choice  what the menu saved. Settings arrive as text, or not at all
//           on a key I've never opened the settings of, so anything
//           that isn't a kind I know means "here".
//   here    the deck the pressed key is on
//   decks   every deck Stream Deck knows about
export function whereToOpen(choice, here, decks) {
  const kind = PAGES[choice] ? Number(choice) : here.type;
  const deck = kind === here.type ? here : decks.find((each) => each.type === kind && each.isConnected);
  if (!deck || !PAGES[kind]) return null;
  return { deck: deck.id, profile: PAGES[kind].profile };
}
