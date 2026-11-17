import { claude } from "./llm";
import type { Message, Rewritten } from "./types";

const system = `You summarize a stretch of a Telegram chat between Bassim ("owner") and hex, his AI assistant, into a version he reads in place of the originals, at most half their length.

Keep what he needs: decisions, results, numbers, names, links, open questions and what waits on him, each said once in its final form. Drop drafts a later message replaced, reasoning, repetition, hedges, greetings and filler. Merge hex's messages in a row into one. Write plain, natural sentences in each speaker's own voice, with hex speaking to Bassim as "you". Links and anything meant to be copied stay exactly as written.

Each original opens with a header line (its id, author, time, what it replies to) that's metadata, not text. Photos show beside your summary as sent, so they need no description.

Write Telegram markdown. Use a comma, colon or semicolon where an em dash might go.

Return the summarized messages, each with its author and "from": the ids of the originals it carries. Every original id is in some "from".`;

const schema = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          author: { type: "string", enum: ["owner", "hex"] },
          text: { type: "string" },
          from: { type: "array", items: { type: "integer" } },
        },
        required: ["author", "text", "from"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
};

const time = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function render(m: Message): string {
  const meta = [
    m.author,
    `${time.format(new Date(m.at))} PT`,
    m.replyTo && `reply to ${m.replyTo}${m.replyToText ? ` ("${m.replyToText}")` : ""}`,
    m.forwardedFrom && `forwarded`,
    m.poll && `poll: ${m.poll.join(" / ")}`,
    m.image && "photo attached",
  ].filter(Boolean);
  return `[${m.id}] ${meta.join(" · ")}\n${m.text}`;
}

export const length = (texts: { text: string }[]) => texts.reduce((n, m) => n + m.text.length, 0);

type Draft = { messages: Omit<Rewritten, "images">[] };

async function draft(messages: Message[], previous?: Draft): Promise<Rewritten[]> {
  const limit = Math.floor(length(messages) / 2);
  const aim = Math.floor(length(messages) * 0.4);
  const originals = messages.map(render).join("\n\n");
  const ask = previous
    ? `${originals}\n\nYour summary came out at ${length(previous.messages)} characters, over the limit of ${limit}:\n\n${JSON.stringify(previous)}\n\nCut it to about ${aim}, never over ${limit}.`
    : `${originals}\n\nThese are ${length(messages)} characters; aim for about ${aim}, never over ${limit}.`;
  const out = await claude<Draft>(system, ask, schema);
  const ids = new Set(messages.map((m) => m.id));
  return out.messages.flatMap((r) => {
    const from = r.from.filter((id) => ids.has(id));
    const images = messages.filter((m) => m.image && from.includes(m.id)).map((m) => m.image!);
    return from.length ? [{ author: r.author, text: r.text, from, images }] : [];
  });
}

/** Haiku's summary of a set, at most half its length: it cuts again, up to twice, while it runs over. */
export async function summarize(messages: Message[]): Promise<Rewritten[]> {
  let best = await draft(messages);
  for (let n = 0; n < 2 && length(best) > length(messages) / 2; n++) {
    const next = await draft(messages, { messages: best.map(({ author, text, from }) => ({ author, text, from })) });
    if (length(next) < length(best)) best = next;
  }
  return best;
}
