# 03 · Memory on my Home page

2026-10-13

I wanted one vital sign on my Home page, the one I'd actually act on,
and for a press on it to open the rest.

## Which one

Memory. Every reading I've looked at had it between 11 and 13 GB out of
16, right on the line between "plenty of room" and "getting full". My
CPU sits around 25% and minds its own business. CPU makes the livelier
key, but on a Home page I want the one that's flat until it matters.

## The press

A stat key did nothing when pressed. Now a press opens the Mac Vitals
page.

All five do it, not only Memory. They're the same kind of key, and a
rule for one of them would have been a special case to remember.

It can only ever open the Mac Vitals page. A plugin is allowed to
switch to the layouts it ships with and nothing else, which I already
knew from Codex Deck and had to re-read anyway.

## Surprise: "create a new profile?"

The first press asked to install a profile I thought I already had.

I did have one, but I'd put it there by opening the file. To Stream
Deck that's a profile I made, not one that belongs to the plugin. So it
installed the plugin's own copy, and for a minute I had two pages both
called "Mac Vitals XL". The keys open the plugin's one. The other is a
spare, deleted in Preferences.

So the order is: let the first press install it. Opening the file by
hand is for looking at a layout while I'm still changing it.

## Wrong deck

> Can the key on my XL open the page on my +?

It can. Switching a profile takes the id of the deck to switch, and
nothing says it has to be the deck the key is on. I'd only ever handed
it that one.

Each stat key's settings now end with an "Open on" menu:

```
The deck this key is on
Stream Deck XL
Stream Deck +
```

The plugin fills it in with whatever is plugged in. Memory on my XL's
Home page is set to the +, so the number stays where I glance and the
whole chart comes up next to the dials.

The menu saves the kind of deck, not that one deck's id. The kind is
what decides which layout to use, and it stays true if I move the cable
to another port. If the deck I picked is unplugged, the key shows the
yellow triangle. It doesn't quietly switch a different deck.

## Did it work?

- Pressed Memory on the XL: the + changed to Mac Vitals. 🎉
- `npm test`: 46 pass. The new ones are about where a press goes,
  like "an unplugged deck is a no".

## What I learned

- A profile I import and a profile a plugin installs are different
  things with the same name.
- "This deck" was an assumption I'd never looked at. The id was right
  there in the call.
