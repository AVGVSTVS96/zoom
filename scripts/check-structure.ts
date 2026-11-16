// Fails unless data/structure.json puts every message of data/general.json in exactly one set, in chat order.
import { join } from "node:path";

type Set = { id: string; title: string; messageIds: number[] };
type Section = { id: string; title: string; sets: Set[] };

const data = join(import.meta.dir, "..", "data");
const messages: { id: number }[] = (await Bun.file(join(data, "general.json")).json()).messages;
const sections: Section[] = (await Bun.file(join(data, "structure.json")).json()).sections;

const position = new Map(messages.map((m, i) => [m.id, i]));
const sets = sections.flatMap((section) => section.sets);
const inChatOrder = (ids: number[]) => ids.every((id, i) => i === 0 || position.get(ids[i - 1])! < position.get(id)!);
const count = <T>(items: T[]) => items.reduce((n, item) => n.set(item, (n.get(item) ?? 0) + 1), new Map<T, number>());

const placed = count(sets.flatMap((set) => set.messageIds));
const errors = [
  ...messages.filter((m) => !placed.has(m.id)).map((m) => `message ${m.id} is in no set`),
  ...[...placed].filter(([id]) => !position.has(id)).map(([id]) => `message ${id} is not in general.json`),
  ...[...placed].filter(([, n]) => n > 1).map(([id, n]) => `message ${id} is in ${n} sets`),
  ...[...count([...sections, ...sets].map((x) => x.id))].filter(([, n]) => n > 1).map(([id]) => `id ${id} is used twice`),
  ...sets.filter((set) => !inChatOrder(set.messageIds)).map((set) => `set ${set.id}: messages out of chat order`),
  ...sets.filter((set) => set.title.length > 28).map((set) => `set ${set.id}: title over 28 characters`),
  ...sections
    .filter((section) => !inChatOrder(section.sets.map((set) => set.messageIds[0])))
    .map((section) => `section ${section.id}: sets out of chat order`),
];

for (const section of sections) {
  const size = section.sets.reduce((n, set) => n + set.messageIds.length, 0);
  console.log(`${section.title.padEnd(16)} ${String(section.sets.length).padStart(2)} sets ${String(size).padStart(3)} messages`);
}
console.log(`${"total".padEnd(16)} ${String(sets.length).padStart(2)} sets ${String(placed.size).padStart(3)} of ${messages.length} messages`);
console.log(errors.join("\n") || "ok");
process.exit(errors.length ? 1 : 0);
