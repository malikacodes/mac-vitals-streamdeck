# 01 · A Wi-Fi key that grew

2026-10-13

I wanted one key on my Stream Deck that hops my Mac between my Wi-Fi
networks and shows which one it's on. By the end of the day it had five
friends and a new name.

## Problem 1: the Mac won't say which network it's on

A key that goes to "the next network" has to know the current one. So I
asked.

```
$ networksetup -getairportnetwork en0
You are not associated with an AirPort network.
```

I was very much associated. I was reading the answer over that network.

```
$ ipconfig getsummary en0
  SSID : <redacted>
```

> Why is my own Wi-Fi name redacted on my own computer?

Because a Wi-Fi name can be looked up on a map, so it counts as
location. macOS only gives it to apps with Location permission, and a
command run by a Stream Deck plugin doesn't have that.

My first plan was to give up on asking: keep a little note of the last
network the key joined, and trust it. That falls apart the first time I
switch from the menu bar.

Then I went through what `scutil` prints about the Wi-Fi card. The name
field there is blank too. But further down is a `CachedScanRecord`, a
long run of hex, and inside that hex my network's name is sitting in
plain letters. It's the Mac's own note about the network it's connected
to, and nobody redacted the note.

```
Stream Deck → plugin → scutil → CachedScanRecord → is one of my names in there?
```

One catch. Two of my networks start with the same word, so "is this
text in there" would say yes to the short name while I was on the long
one. The record is a binary property list, and in that format every
piece of text has a small tag in front saying how long it is. So I look
for the tag and the name together, which only matches the whole name.

## Problem 2: "Can't join"

The key showed the right network. I pressed it. It thought about it and
went back to where it started.

```
Failed to join network.
Error: -3900  The operation couldn't be completed. tmpErr
```

"tmpErr". Very helpful. Thanks.

I assumed the other network was out of range. Then I asked the Mac to
rejoin the network it was already on, and got the same error. So it was
never about range: on this macOS, `networksetup` won't join anything
unless it's handed the password, even a network the Mac knows by heart.

The Mac's own saved copies are in the System keychain, which asks for
my Mac password every time. No good for a key. So the key gets its own
copies in my login keychain, saved once from Terminal at a hidden
prompt:

```bash
security add-generic-password -U -s wifi-toggle -a "Network Name" -w   # asks twice, shows nothing
```

The key now tells the two failures apart, because they need different
things from me. "No password" means go run that command. "Can't join"
means the password is wrong or the network is out of range.

## Problem 3: the key and the menu bar disagree

It worked. I pressed it a lot, because it worked. Then the key said one
network and the menu bar said another.

**First suspect: me, tapping too fast.** The key is meant to ignore
presses while a switch is in progress. But it only put up its "busy"
sign after checking which network the Mac was on, and that check takes
a moment. A second fast press could walk in through the gap and start
its own switch on top of the first. Now the sign goes up the instant a
press arrives, before anything that waits.

A real hole, and worth closing. It wasn't the answer.

**The actual answer: the key was right.** It happened again, so I
looked at what the Mac itself said, two different ways. Both said
channel 44, on the 5GHz band. The network the menu bar was showing
lives on channel 6. The Mac can't be on both, so the menu bar was the
one that was behind. After a couple of quick switches made from outside
it, the menu takes a few seconds to catch up.

I spent a while debugging my key for being more honest than Apple's
menu.

## Then it grew

I'd set it up for three networks and took one out. That one is for my
smart devices, and my laptop has no business on it. Two networks makes
it a proper toggle.

And once a key could show the network, I wanted to see how fast the
network was going. And then how the Mac was doing. So there are five
more keys now: CPU, memory, download, upload and ping, each with a
number and a pink line of the last minute. Same pink as my Pomodoro
heat map and my audio dial, `#f2a7c3`, so they match when they sit
together.

![The six keys](assets/01-a-wifi-key-that-grew/keys.png)

All five are read with tools the Mac already has (`vm_stat`, `netstat`,
`ping`, and Node's own CPU timings), so there was no Problem 4.

"Wi-Fi Toggle" was the wrong name for all that. It's Mac Vitals now:
nursing and computers in one name, which is about right for me.

## What I learned

- macOS treats my Wi-Fi name as my location. The easy commands still
  exist, they just don't answer anymore.
- Read the error for the thing that works. Asking the Mac to rejoin the
  network it was on is what proved the problem was the password and not
  the distance.
- A check, then a wait, then a "busy" flag is a gap. The flag goes
  first.
- When two things disagree, find a third thing to ask before deciding
  which one is broken. That lesson keeps finding me.
- A test caught my first error message being too long for the key
  before I ever saw it cut off. "Couldn't join" became "Can't join".

## What's next

- Layouts for my XL and my Stream Deck +, so I'm not dragging six keys
  on by hand.
- I look at these numbers and don't know if they're good. The keys
  should tell me.
