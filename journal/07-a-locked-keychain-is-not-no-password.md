# 07 · A locked keychain is not "no password"

2026-10-17

Joining a network is the one place the plugin handles a real password,
so I went through it slowly. Two things were wrong, and one of them
would have sent me to Terminal for no reason.

## "Nothing saved" and "couldn't look" are different

My passwords live in the login keychain, and `savedPassword` fetches
one with the `security` command. If the command failed, for any reason,
it said "no password" and the key went on to join without one. The
only failure that really means nothing's saved is `security` exiting
with 44. A locked keychain exits with something else. So did a lookup
that hung and got cut off by the three second limit, which has no exit
code at all.

Treating those as "nothing saved" showed me the "No password" notice,
which tells me to go save one in Terminal. I'd have saved a password I
already had. Now only 44 means none. Anything else stops the join with
its own message, and the key says "Can't join", which is true.

## Keeping the password out of the log

The error text ends up in the plugin's log file, and the password is
on the command line (that's how `networksetup` takes it). Node's own
"Command failed" message repeats that command line, so the catch
already swapped it for a short one. The other path was new to me:
`networksetup` can also print a reason and carry on as if all was
well, and nothing promised the reason wouldn't quote the password
back. It's blanked out now before it's thrown.

A test checks both paths with a fake password in every place it could
leak: the command's error, its output, and the reason text.

## Did it work?

- `npm test`: 76 pass, up from 70.
- The exit code is a plain number on the error. I checked it with a
  made-up keychain name, which gives 44 as hoped.
- Not covered: a reason that quotes the password in a changed form,
  like cut short or in capitals. I haven't seen `networksetup` do it.

## What I learned

- "Couldn't find it" and "couldn't look" need different answers.
- A password on a command line is how this tool works. The job is
  making sure it goes no further than the command line.
