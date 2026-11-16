import { basename } from "node:path";
import type { Message } from "./types";

type Raw = {
  id: number;
  author: "owner" | "hex";
  at: string;
  text: string;
  image?: string;
  reply_to?: number;
  reply_to_text?: string;
  forwarded_from?: string;
  edited_at?: string;
  older_message_edited_in_window?: boolean;
  poll_options?: string;
};

export type Source = { thread: string; from: string; to: string; messages: Message[] };

/** Reads a thread export like data/general.json. Images are named relative to the data folder. */
export async function source(file: string): Promise<Source> {
  const raw = await Bun.file(file).json();
  const messages: Message[] = raw.messages.map((m: Raw) => ({
    id: m.id,
    author: m.author,
    at: m.at,
    text: m.text,
    ...(m.image && { image: basename(m.image) }),
    ...(m.reply_to && { replyTo: m.reply_to }),
    ...(m.reply_to_text && { replyToText: m.reply_to_text }),
    ...(m.forwarded_from && { forwardedFrom: m.forwarded_from }),
    ...(m.edited_at && { editedAt: m.edited_at }),
    ...(m.older_message_edited_in_window && { olderEditedInWindow: true }),
    ...(m.poll_options && { poll: m.poll_options.split(" / ") }),
  }));
  return { thread: raw.thread, from: raw.from, to: raw.to, messages };
}
