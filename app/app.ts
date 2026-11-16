import type { Answer, Result, Sources } from './app.contract.d.ts';
// Written by scripts/content.ts from data/, which stays out of git: the messages ship inside the app.
import content from './content.json';

export const grants = '';

const sources: Sources = {
  loadContent: (): Result<'loadContent'> => content,
};
export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
