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
  /** Sent before the window and edited inside it. */
  olderEditedInWindow?: boolean;
  poll?: string[];
};

/** Level 2: the summary of a set of messages, as messages. */
export type Rewritten = {
  author: Author;
  text: string;
  /** Ids of the original messages this one carries. */
  from: number[];
  images: string[];
};

export type RewriteSet = {
  id: string;
  messageIds: number[];
  rewrite: Rewritten[];
  /** Characters in the rewrite over characters in the originals. */
  length: number;
};

export type Zoom = {
  thread: string;
  from: string;
  to: string;
  generatedAt: string;
  model: string;
  messages: Message[];
  sets: RewriteSet[];
  /** Level 3, as data/structure.json defines it, passed through. */
  sections: unknown[];
};
