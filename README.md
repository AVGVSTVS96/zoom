# zoom

A chat you can read at three levels, with a pinch between them. Semantic zoom for a busy Telegram topic: pinch together to see less, apart to see more, and the message under your fingers stays where it is.

```
Map                  Short                    Full
───────────────      ─────────────────────    ─────────────────────
Moving day  9:02     Moving day       9:02    Moving day       9:02

The van…       3     The van is booked        The van is booked
Boxes          2       you  book a van for      you  9:02 AM
Keys           1       Saturday morning         can you book a van
                       hex  booked, 8 to        for sat, morning
                       noon, $89. Bring         hex  9:02 AM
                       your license.            On it. …
```

Every level is the chat itself, whole and in chat order, cut into exchanges ("sets") under section headings.

- **Map**: each exchange as one line, with how many messages it holds, under headings with their time.
- **Short**: each exchange summarized by Claude Haiku 5.5 to at most half its length, still a chat.
- **Full**: every message word for word, with its time, the message it replies to, photos and polls.

Pinch, tap a row or a message, or use the control at the bottom. The message under your fingers keeps its place. On a screen wide enough for a map beside the chat (an open Duo on its side), the map stays on the left.

`docs/design.md` is the design: the grouping, how zooming behaves, and what lossless means.

## How it fits together

```
data/general.json ─┐                                 (the thread, kept out of git)
data/structure.json├─ scripts/content.ts ─▶ app/content.json ─▶ the app, bundled at build
data/zoom.json ────┘   (sections, sets and their summaries)
```

- `app/` is an [Exact](https://github.com/expo/exact) app: `app.contract` holds the levels, the pinch, the anchors and the control, `parts.contract` a level's sections, titles and messages.
- `pipeline/` writes `data/zoom.json`: Haiku 5.5 summarizes each set to at most half its length.
- `scripts/sim` drives the app on an iPhone Duo simulator in each pose, light and dark; `scripts/ship` builds it on a Mac, signs it and puts it on [hangar](https://github.com/AVGVSTVS96/hangar).

## License

MIT
