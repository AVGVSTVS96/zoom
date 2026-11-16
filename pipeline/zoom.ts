import { check, gaps } from "./check";
import { rewrite } from "./rewrite";
import type { Check, Message, Rewritten } from "./types";

export type Result = { rewrite: Rewritten[]; check: Check; rounds: number };

/**
 * The step: Muse Wonder rewrites one message or a set, a judge checks it for loss, and
 * Muse Wonder puts back what it lost, up to `repairs` times. Two fresh judges then score
 * the best draft; if they find a loss, Muse Wonder gets one more try, scored by two more.
 * Every score is from judges whose findings never shaped the draft they scored.
 */
export async function zoom(messages: Message[], dataDir: string, repairs = 3): Promise<Result> {
  let draft = await rewrite(messages, dataDir);
  let best = { draft, check: await check(messages, draft, [0]) };
  let rounds = 1;
  while (!best.check.loss.lossless && rounds <= repairs) {
    draft = await rewrite(messages, dataDir, { draft: best.draft, gaps: gaps(best.check) });
    const next = await check(messages, draft, [0]);
    rounds++;
    if (better(next, draft, best)) best = { draft, check: next };
  }
  best = { draft: best.draft, check: await check(messages, best.draft, [1, 2]) };
  if (!best.check.loss.lossless) {
    draft = await rewrite(messages, dataDir, { draft: best.draft, gaps: gaps(best.check) });
    const next = await check(messages, draft, [3, 4]);
    rounds++;
    if (better(next, draft, best)) best = { draft, check: next };
  }
  return { rewrite: best.draft, check: best.check, rounds };
}

const length = (draft: Rewritten[]) => draft.reduce((n, r) => n + r.text.length, 0);

/** Lossless beats not, then the higher score, then the shorter draft. */
function better(check: Check, draft: Rewritten[], best: { draft: Rewritten[]; check: Check }): boolean {
  const a = check.loss;
  const b = best.check.loss;
  if (a.lossless !== b.lossless) return a.lossless;
  if (a.score !== b.score) return a.score > b.score;
  return length(draft) < length(best.draft);
}
