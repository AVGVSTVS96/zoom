# Design

zoom reads one chat at three levels. Every level holds the same messages in the same order, so zooming changes how much each one says and never where it is.

## The data

`data/structure.json` is the grouping: one tree, three levels deep.

```ts
type Structure = { source: string; sections: Section[] };

// Level 3: a heading on the map.
type Section = { id: string; title: string; sets: Set[] };

// Level 2: the unit Muse Wonder rewrites.
type Set = {
  id: string;
  title: string; // its one line on the map, 28 characters at most
  messageIds: number[]; // level 1, in chat order
  waiting?: string; // what the exchange leaves with you
};
```

```
section            "You asked"
└─ set             "Dark mode by default"
   ├─ message      the request
   └─ message      the answer
```

Reading order is file order at every level: sections, then a section's sets, then a set's messages. Every message is in exactly one set and every set in exactly one section; `bun scripts/check-structure.ts` fails if that stops being true.

`data/zoom.json` is what the app loads, typed by `Zoom` in `pipeline/types.ts`:

| field      | level | what it holds                                                    |
| ---------- | ----- | ---------------------------------------------------------------- |
| `sections` | 3     | `structure.json`'s sections, passed through unchanged            |
| `sets`     | 2     | one per structure set, same `id`: its rewrite and its loss check |
| `messages` | 1     | every original, word for word                                    |
| `loss`     |       | the totals the map shows                                         |

The app walks `sections`, and for each set id reads the rewrite from `sets` and the originals from `messages`.

Three things the grouping needs from `zoom.json`:

1. A set's rewrite is a short run of messages, each with its author and the ids it carries, so level 2 is still a chat.
2. A message keeps the text of the message it replies to, since that message can sit outside the window.
3. A set whose check is not lossless shows its originals at level 2.

## One list, three states

The whole app is one list of sets under section headings. A set is a title and a body, and the level decides the body.

```
Map                  Short                    Full
───────────────      ─────────────────────    ─────────────────────
You asked            You asked                You asked

● A video            ● A video            3   ● A video            3
  Dark mode            you  what is this,       you  6:51 PM
  A missing file       worth using?             https://… what is
                       hex  a launch promo      this, is it worth
Outages                for a database.          using for…
                       Keep it saved,           hex  6:53 PM
  Down 5 minutes       don't adopt it.          Looking into it,
  Slow after…                                   I'll reply here…
                       Dark mode          2     hex  8:43 PM
                       …                        That video is a…
```

| level | name  | a set's body                         | for                                   |
| ----- | ----- | ------------------------------------ | ------------------------------------- |
| 3     | Map   | none                                 | seeing everything, finding a place    |
| 2     | Short | Muse Wonder's rewrite                | reading                               |
| 1     | Full  | the original messages, word for word | the exact words, checking the rewrite |

The title is the handle. A set's title is the same words at the same left edge at all three levels: a line on the map, the heading over the rewrite, the heading over the originals. It is what the eye holds while everything around it changes.

What a row carries, and nothing else:

- **Title**, with a dot before it when the set has `waiting`. The dot is the only accent color in the app.
- **Time** of its first message, on the map.
- **Message count** at Short and Full, so a three-line rewrite says it stands for thirteen messages.
- **Body.** Your messages sit right in a bubble and hex's run full width as text, at Short and at Full. Full adds each message's time, the quoted message under a reply, the photo, a poll's options, and "forwarded" or "edited" where true.

The map opens with one line of totals: messages, how many wait on you, and the lossless number (see [Lossless](#lossless)). The app opens at Short, because that is the level made for reading, and comes back to the level and set it was left on.

## Grouping

### Sets

A set is what would have been one exchange had it been written once, with hindsight.

1. **An ask and everything said until it settles.** The request, the "on it", the answer, the follow-up. Thirteen messages of diagnosis that end in one confirmed cause are one set.
2. **A message goes with what it answers**, even when an unrelated message landed in between. Three sets here reach across one.
3. **A new question starts a new set**, even on the same subject. The long conversation here is three: the cause and the fixes, the text drafted to send, the second opinion.
4. **Versions of one post are one set.** A status post and its repost are the same message twice.
5. **A notice nobody answered is a set of one.**

### Sections

A hub chat is many unrelated exchanges, so its sections are kinds: who started it, and what became of it.

| section        | what goes in it                                  | sets | messages |
| -------------- | ------------------------------------------------ | ---- | -------- |
| New topics     | you asked, and hex opened a topic for it         | 5    | 11       |
| You asked      | you asked, and hex answered or did it in place   | 3    | 7        |
| _its subject_  | a conversation that runs to three sets or more   | 3    | 21       |
| hex brought up | mail, deliveries and ideas hex raised on its own | 5    | 7        |
| Outages        | hex or a machine went down, and the fixes        | 4    | 6        |
| Status posts   | pinned posts kept current, one set per topic     | 7    | 8        |
|                |                                                  | 27   | 60       |

Order:

- Sections you started come first, in the order they began. Then hex's own, from what asks the most of you to what asks the least.
- Sets inside a section, and messages inside a set, stay in chat order.

Level 1 is therefore every message grouped with its exchange, each with its real time, and not the raw chat sequence. In a hub chat the neighbors in time are unrelated, so nothing is lost by moving an exchange next to its kind, and what a rewrite stands for is always directly under it. In a chat that is one running conversation, the same rules give sections that follow each other in time, and the order is the chat's.

### Waiting

A set has `waiting` when the exchange ends with something for you: an open question, a poll, an offer, a thing to do. It names that thing in one sentence. Six sets have it here. Status posts never do, because they are the list of what waits.

### Titles

A title names the thing, and the outcome when there is one: "Down 5 minutes", not "Outage report". 28 characters keeps it on one line on a folded Duo.

## Zooming

```
        pinch together                 pinch together
Full  ─────────────────▶  Short  ─────────────────▶  Map
      ◀─────────────────         ◀─────────────────
        pinch apart, or              pinch apart, or
        tap the set                  tap the set
```

**Pinch anywhere.** The levels are stops on one continuous scale, and the pinch moves along it with the fingers: bodies grow or shrink in height while their two contents cross-dissolve, driven by the fingers and not by a timer. One long pinch can pass through all three. On release the list springs to the nearer stop, or the next one in the direction of a fast pinch. A light haptic marks each stop as the fingers cross it.

**The set under the fingers stays under the fingers.** The pinch's midpoint picks a set, and that set's title keeps its place on screen for the whole gesture. Because every level is the same list in the same order, what was above stays above and what was below stays below. On a section heading the anchor is the heading.

**Tap goes one level in.** Tap a line on the map to read that set; tap a set at Short to see its originals. Same motion as the pinch, anchored on the tapped set, about a quarter of a second.

**A three-stop control goes anywhere, one-handed.** Map, Short, Full, at the bottom edge in thumb reach. Its thumb tracks the pinch while fingers are down, so it doubles as the level indicator. It is the only control in the app.

**Nothing waits.** All three states of every set are laid out before the first pinch. With reduced motion on, levels cross-dissolve in place with no resizing.

Starting values, to tune on the Duo: one stop per 1.6× of pinch scale, and a stop taken once the pinch is past halfway to it.

## The Duo

Layout follows the viewport's width and never the fold. A reading column is at least 380pt, so two fit from 760pt; that is a starting value too.

| width           | Map                                             | Short                | Full                                     |
| --------------- | ----------------------------------------------- | -------------------- | ---------------------------------------- |
| one column fits | one column                                      | one column           | originals replace the rewrite            |
| two columns fit | sections in columns, the whole chat on a screen | one column, centered | rewrite on the left, originals beside it |

Open, Full puts each set's rewrite next to the messages it was written from, which is the lossless claim made visible: read across and check. Zooming from Short, the rewrite slides left as its originals open on the right.

- Every orientation, folded and open. Folding or rotating keeps the level and the set.
- A column gutter lands on the hinge when there is one.
- The level control sits at the bottom, clear of the hinge and the home indicator. No header.
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

Lossless is measured inside a set. Two sets that repeat each other, like two status posts carrying the same list, each keep their copy.
