// Fails unless data/structure.json is data/general.json's chat, whole and in chat order: read top to bottom, its message ids are the chat's ids ascending.
import { join } from "node:path";

type Set = { id: string; title: string; messageIds: number[] };
type Section = { id: string; title: string; sets: Set[] };

const data = join(import.meta.dir, "..", "data");
const messages: { id: number }[] = (await Bun.file(join(data, "general.json")).json()).messages;
const sections: Section[] = (await Bun.file(join(data, "structure.json")).json()).sections;

const sets = sections.flatMap((section) => section.sets);
const chat = messages.map((m) => m.id).sort((a, b) => a - b);
const placed = sets.flatMap((set) => set.messageIds);
const ids = [...sections, ...sets].map((x) => x.id);

const errors = [
  ...chat.filter((id) => !placed.includes(id)).map((id) => `message ${id} is in no set`),
  ...placed.filter((id) => !chat.includes(id)).map((id) => `message ${id} is not in general.json`),
  ...placed.filter((id, i) => i > 0 && id <= placed[i - 1]).map((id) => `message ${id} is out of chat order`),
  ...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => `id ${id} is used twice`),
  ...[...sections, ...sets].filter((x) => x.title.length > 28).map((x) => `${x.id}: title over 28 characters`),
  ...sections.filter((section) => !section.sets.length).map((section) => `section ${section.id} is empty`),
];

for (const section of sections) {
  const size = section.sets.reduce((n, set) => n + set.messageIds.length, 0);
  console.log(`${section.title.padEnd(28)} ${String(section.sets.length).padStart(2)} sets ${String(size).padStart(3)} messages`);
}
console.log(`${"total".padEnd(28)} ${String(sets.length).padStart(2)} sets ${String(placed.length).padStart(3)} of ${chat.length} messages`);
console.log(errors.join("\n") || "ok");
process.exit(errors.length ? 1 : 0);
