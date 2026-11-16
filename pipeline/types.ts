// The shape of data/zoom.json, which the app reads.

export type Author = "owner" | "hex";

/** Level 1: a Telegram message exactly as sent (its latest edit). */
export type Message = {
  id: number;
  author: Author;
  at: string;
  text: string;
  image?: string;
  replyTo?: number;
  /** The text of the message it replies to, which can sit outside the window. */
  replyToText?: string;
  forwardedFrom?: string;
  editedAt?: string;
  poll?: string[];
};

/** Level 2: Muse Wonder's rewrite of a set of messages, as messages. */
export type Rewritten = {
  author: Author;
  text: string;
  /** Ids of the original messages this one carries. */
  from: number[];
  images: string[];
};

/** How one piece of an original came through the rewrite. */
export type Verdict = "kept" | "duplicate" | "superseded" | "partial" | "changed" | "missing";

/** One sentence, list item or code block of an original message. */
export type Unit = {
  id: string;
  messageId: number;
  text: string;
  verdict: Verdict;
  /** What the rewrite lost or got wrong, for partial, changed and missing. */
  detail?: string;
  /** Text in the rewrite that carries it, checked to be there word for word. */
  quote?: string;
  /** The unit that carries it instead, for duplicate and superseded. */
  ref?: string;
};

/** A link, code span, number or ID that has to survive word for word. */
export type Verbatim = { messageId: number; text: string; kind: "link" | "code" | "number" | "image"; kept: boolean };

/** A claim in the rewrite that the originals don't back. */
export type Addition = { quote: string; detail: string };

export type Loss = {
  units: number;
  unitsKept: number;
  verbatim: number;
  verbatimKept: number;
  additions: number;
  /** Share of everything checked (units and verbatim) that came through, 0 to 1. */
  score: number;
  lossless: boolean;
};

export type Check = { loss: Loss; units: Unit[]; verbatim: Verbatim[]; additions: Addition[] };

export type RewriteSet = {
  id: string;
  messageIds: number[];
  rewrite: Rewritten[];
  /** Characters in the rewrite over characters in the originals. */
  length: number;
  check: Check;
};

export type Zoom = {
  thread: string;
  from: string;
  to: string;
  generatedAt: string;
  models: { rewrite: string; check: string };
  messages: Message[];
  sets: RewriteSet[];
  /** Level 3, as data/structure.json defines it, passed through. */
  sections: unknown[];
  loss: Loss;
  costUsd: number;
};
