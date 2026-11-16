import { check, gaps } from "./check";
import { repair, rewrite, tighten } from "./rewrite";
import type { Check, Message, Rewritten } from "./types";

export type Result = { rewrite: Rewritten[]; check: Check; rounds: number };

/**
 * The step: Muse Wonder rewrites one message or a set, a judge checks it for loss, and
 * Muse Wonder puts back what it lost, up to `repairs` times. A lossless draft that's
 * still long gets one try at cutting deeper. Two fresh judges then score the best draft;
 * if they find a loss, Muse Wonder gets one more try, scored by two more. Every score is
 * from judges whose findings never shaped the draft they scored.
 */
export async function zoom(messages: Message[], dataDir: string, repairs = 3): Promise<Result> {
  const original = messages.reduce((n, m) => n + m.text.length, 0);
  let rounds = 0;
  let best: Draft | undefined;
  const attempt = async (ask?: (d: Draft) => string, runs = [0]) => {
    const draft = await rewrite(messages, dataDir, best && ask && { draft: best.draft, ask: ask(best) });
    const next = { draft, check: await check(messages, draft, runs) };
    rounds++;
    if (!best || better(next, best)) best = next;
    return next;
  };
  await attempt();
  while (!best!.check.loss.lossless && rounds <= repairs) await attempt((d) => repair(gaps(d.check)));
  if (best!.check.loss.lossless && length(best!.draft) / original > 0.7) {
    const cut = await attempt((d) => tighten(length(d.draft) / original));
    if (!cut.check.loss.lossless) {
      const kept = best!;
      best = cut;
      await attempt((d) => repair(gaps(d.check)));
      if (!best!.check.loss.lossless || length(best!.draft) >= length(kept.draft)) best = kept;
    }
  }
  best = { draft: best!.draft, check: await check(messages, best!.draft, [1, 2]) };
  if (!best.check.loss.lossless) await attempt((d) => repair(gaps(d.check)), [3, 4]);
  return { rewrite: best.draft, check: best.check, rounds };
}

type Draft = { draft: Rewritten[]; check: Check };

const length = (draft: Rewritten[]) => draft.reduce((n, r) => n + r.text.length, 0);

/** Lossless beats not, then the higher score, then the shorter draft. */
function better(next: Draft, best: Draft): boolean {
  const a = next.check.loss;
  const b = best.check.loss;
  if (a.lossless !== b.lossless) return a.lossless;
  if (a.score !== b.score) return a.score > b.score;
  return length(next.draft) < length(best.draft);
}
