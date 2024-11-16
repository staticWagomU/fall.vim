import type { Detail, IdItem } from "jsr:@vim-fall/core@^0.2.1/item";
import type { Source } from "jsr:@vim-fall/core@^0.2.1/source";

/**
 * Create a source from a list
 */
export function list<T extends Detail>(items: readonly IdItem<T>[]): Source<T> {
  return {
    collect: async function* () {
      yield* items;
    },
  };
}