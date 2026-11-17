# Design

zoom reads one chat at three levels. Every level is the chat itself, whole and in chat order, so zooming changes how much each message says and never where it is.

## The data

`data/structure.json` is the grouping: one tree, three levels deep.

```ts
type Structure = { source: string; sections: Section[] };

// Level 3: a heading on the map.
type Section = { id: string; title: string; sets: Set[] };

// Level 2: the unit Muse Wonder rewrites.
type Set = {
  id: string;
  title: string; // its one line on the map
  messageIds: number[]; // level 1: a run of the chat, no gaps
};
```

```
section            "Moving day"
└─ set             "The van is booked"
   ├─ message      the request
   ├─ message      "on it"
   └─ message      the answer
```

Read top to bottom, the file's message ids are the chat's ids ascending: every message once, none moved. `bun scripts/check-structure.ts` fails when that stops being true. Titles are 28 characters at most.

`data/zoom.json` is what the app loads, typed by `Zoom` in `pipeline/types.ts`:

| field      | level | what it holds                                                    |
| ---------- | ----- | ---------------------------------------------------------------- |
| `sections` | 3     | `structure.json`'s sections, passed through unchanged            |
| `sets`     | 2     | one per structure set, same `id`: its rewrite and its loss check |
| `messages` | 1     | every original, word for word                                    |
| `loss`     |       | the totals the map shows                                         |

The app walks `sections`, and for each set id reads the rewrite from `sets` and the originals from `messages`.

Four things the design needs from `zoom.json`:

1. A set's rewrite is a short run of messages, each with its author and `from`, the ids of the originals it carries. Level 2 is still a chat, and `from` is how a pinch finds its place.
2. A message keeps the text of the message it replies to.
3. A message that is older than the window and was edited inside it says so, and its time is the edit's.
4. A set's summary is about half its originals' length, never shorter.

## From the post

[Fabian Rohlik's mockup](https://x.com/fabrohl/status/2121732490318495794) pinches a chat out into an overview and back.

| kept from it                                 | added here                                            |
| -------------------------------------------- | ----------------------------------------------------- |
| pinch on the chat itself, no separate screen | a middle level: the same messages, rewritten shorter  |
| the overview keeps chat order                | a row on the overview is an exchange, not one message |
| topic headings with their time on the right  | a measured check that the shorter level loses nothing |
| one line per row, tap a row to land on it    | the place under the fingers holds through the pinch   |

## One list, three states

The whole app is one list: the chat, cut into sets under section headings. A set is a title and a body, and the level decides the body. The examples are invented.

```
Map                  Short                    Full
───────────────      ─────────────────────    ─────────────────────
Moving day  9:02     Moving day       9:02    Moving day       9:02

The van…       3     The van is booked        The van is booked
Boxes          2       you  book a van for      you  9:02 AM
Keys           1       Saturday morning         can you book a van
                       hex  booked, 8 to        for sat, morning
Dinner      6:40       noon, $89. Bring         if possible
                       your license.            hex  9:02 AM
Table for…     4                                On it.
                     Boxes                      hex  9:10 AM
                       …                        Booked: Saturday…
```

| level | name  | a set's body                         | for                                   |
| ----- | ----- | ------------------------------------ | ------------------------------------- |
| 3     | Map   | none                                 | seeing everything, finding a place    |
| 2     | Short | Haiku 5.5's summary                  | reading                               |
| 1     | Full  | the original messages, word for word | the exact words, checking the rewrite |

The title is the handle. A set's title is the same words at the same left edge at all three levels: a line on the map, the heading over the rewrite, the heading over the originals. It is what the eye holds while everything around it changes.

What is on screen, and nothing else:

- **Section heading**: its title, and the time of its first message on the right.
- **Set title**, with its message count on the map, so a row says how much is behind it.
- **Body.** Your messages sit right in a bubble and hex's run full width as text, at Short and at Full. Full adds each message's time, the quoted message under a reply, the photo, a poll's options, and "forwarded" or "edited" where true.
- **One line of totals** above the first section on the map: messages, sets, and the lossless number (see [Lossless](#lossless)).

The newest message is at the bottom, where a chat keeps it. The app opens at Short on the newest set, and after that comes back to the level and message it was left on.

## Grouping

### Order

Chat order, exactly, at every level. A set is a run of consecutive messages and a section is a run of consecutive sets, so nothing is ever moved to sit with its kind. Chat order is message id order: a post edited later keeps the place it was first sent in.

### Sets

A set is what would have been one exchange had it been written once, with hindsight.

1. **An ask and everything said until the subject changes.** The request, the "on it", the answer, the correction, the second opinion. Twenty-one messages in twelve minutes on one problem are one set, so the rewrite states each thing once, as it stood at the end.
2. **A set never reaches across another subject.** When an unrelated notice lands between a question and its answer, that is three sets, in the order they happened.
3. **Twin posts are one set.** Two posts in a row that carry the same list say it once.
4. **A notice nobody answered is a set of one.**

Most of what a lossless rewrite can take out is repetition between messages, which is why a set is the whole exchange and not a piece of it.

### Sections

A section is a stretch of the chat that hangs together: one subject, or one sitting when the subjects come too fast to head each one. It starts where the subject or the sitting changes. Its title names the subject, or the biggest things in the sitting.

This chat is 7 sections, 27 sets, 61 messages. A hub chat like this one changes subject at almost every set, so most of its sections are sittings; a chat that is one long conversation gets a section per subject.

### Edited posts

A status post edited inside the window is an older message. It sits where it was first sent, above everything else, under its own heading, with "edited" and the edit's time. It goes through the same rewrite and the same gate as any set. It will come out close to its own length, because hex already keeps it current by editing it in place: it is the one kind of message that was written with hindsight.

### Titles

A title names the thing, and the outcome when there is one: "Back up after 48 min", not "Outage report". When a section holds one set, the two titles say different things: the subject, then what came of it. 28 characters stay on one line beside a count on the Duo's cover.

## Zooming

```
        pinch together                 pinch together
Full  ─────────────────▶  Short  ─────────────────▶  Map
      ◀─────────────────         ◀─────────────────
        pinch apart, or              pinch apart, or
        tap the message              tap the row
```

**Pinch anywhere.** The levels are stops on one continuous scale, and the pinch moves along it with the fingers: bodies grow or shrink in height while their two contents cross-dissolve, driven by the fingers and not by a timer. One long pinch can pass through all three. On release the list springs to the nearer stop, or the next one in the direction of a fast pinch. A light haptic marks each stop as the fingers cross it.

**The place under the fingers stays under the fingers.** The pinch's midpoint picks a message, and the list holds that place on screen for the whole gesture:

| under the fingers             | zooming in                       | zooming out                                 |
| ----------------------------- | -------------------------------- | ------------------------------------------- |
| an original, at Full          |                                  | the rewritten message whose `from` holds it |
| a rewritten message, at Short | the first original in its `from` | its set's row on the map                    |
| a row on the map              | that set's title at Short        |                                             |

Because every level is the same chat in the same order, what was above stays above and what was below stays below.

**Tap goes one level in**, to the same place a pinch would: a row on the map opens that set at Short, a rewritten message opens the originals it carries. Same motion as the pinch, about a quarter of a second.

**A three-stop control goes anywhere, one-handed.** Map, Short, Full, at the bottom edge in thumb reach. Its thumb tracks the pinch while fingers are down, so it doubles as the level indicator. It is the only control in the app.

**Nothing waits.** All three states of every set are laid out before the first pinch. With reduced motion on, levels cross-dissolve in place with no resizing.

Starting values, to tune on the Duo: one stop per 1.6× of pinch scale, and a stop taken once the pinch is past halfway to it.

## The Duo

One column at every size. A set never changes column, so the anchor rule holds everywhere.

| screen           | size      | layout                                        |
| ---------------- | --------- | --------------------------------------------- |
| cover, portrait  | 466 × 678 | one column                                    |
| cover, landscape | 678 × 466 | one column                                    |
| open, portrait   | 669 × 951 | one column                                    |
| open, landscape  | 951 × 669 | the map stays on the left, the chat beside it |

Layout follows the viewport's width and never the fold. When the viewport has room for a 300pt map beside a reading column of 560pt or more, the map stays: it marks the set being read, a tap on a row brings that set to the top, and the control has two stops, Short and Full. Narrower than that, the map is the third stop. Both numbers are starting values.

- Folding or rotating keeps the level and the message.
- The control sits at the bottom, clear of the home indicator. No header.
- Light and dark.

## Lossless

A rewrite is lossless when someone who reads only the rewrite knows everything, and can do everything, that a reader of the originals could.

Four tests, per set:

1. **Every piece lands.** Each sentence, list item and code block of the originals is one of:
   - **kept**: in the rewrite with the same meaning and the same certainty;
   - **duplicate**: said again by another piece that is kept;
   - **superseded**: corrected or replaced by a later message in the same set, with the rewrite carrying the final version and the check naming the piece that replaced it.

   Anything else is loss: missing, partial, or changed.
2. **Exact strings survive exactly.** Links, numbers, times, money, ids, names, commands, code, and any text drafted to be copied or sent.
3. **Nothing is added.** Every statement in the rewrite traces to an original.
4. **Who said it holds.** Your words stay yours and hex's stay hex's. A guess stays a guess, what was checked stays checked, and a question to you stays a question to you.

What a rewrite may drop: greetings, acknowledgements, apologies, a promise the same set goes on to keep, repetition, and tone. What it may not: a decision made along the way. An option you ruled out stays ruled out in the rewrite, because it still tells a reader something.

Photos and polls are not rewritten. They ride along with their set.

The writer never grades itself: meaning is checked by a different model than wrote the rewrite, and exact strings by code.

**The number** is pieces and exact strings that came through, over all that were checked, with additions counted beside it. The map shows it once for the whole chat, and Full shows it per set.

**The gate.** Lossless is a pass or a fail, not a score to trade against brevity. A set that misses a full score, or adds anything, shows its originals at Short, marked "original", so Short never says less than the chat did. In the reader the originals are one pinch away. Where a rewrite replaces the original, as when editing a sent message, the gate is the only protection: the edit goes out only at a full score, and the original is saved first.

Lossless is measured inside a set. Two sets that repeat each other each keep their copy.

## Choices

- **Chat order over sections by kind.** Grouping by kind (requests, notices, outages, status posts) makes a tidier map, and puts the newest message in the middle of the list and one afternoon in three places. The newest message belongs at the bottom, and a level that moves messages is no longer the chat.
- **No "waiting on you" mark.** Which exchanges still wait on you changes after the window closes and is a judgment the lossless check cannot test. A mark that is sometimes wrong is worse than none for someone who misses messages. It belongs here once it comes from hex's own list of open questions.
- **No unread line.** It needs to know what you have read, which the chat's export does not say. Until then, new is where a chat keeps it: at the bottom, where the app opens.
- **No rule of their own for status posts.** They go through the same gate. Being pinned and edited in place, they are already short for what they hold.
- **Invented examples.** The chat this was designed on is private, so nothing in this file quotes it.
