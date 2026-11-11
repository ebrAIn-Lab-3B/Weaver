/** How a pull request stands, as a card shows it. */
export type CardPullState = 'open' | 'merged' | 'closed';

/** A pull request that refers to the Issue of a card (DEC-022). */
export interface CardPull {
  number: number;
  url: string;
  title: string;
  state: CardPullState;
  /** True when the pull request closes the Issue of the card, not only refers to it (TASK-114). */
  closes?: boolean;
}

/** What GitHub gives for a pull request: the state is `OPEN`, `MERGED`, or `CLOSED`. */
export interface RawPull {
  number?: number;
  url?: string;
  title?: string;
  state?: string;
}

/** A card shows at most this many pull requests (DEC-022 item 2). */
export const MAX_CARD_PULLS = 3;

function stateOf(raw: string | undefined): CardPullState | undefined {
  switch ((raw ?? '').toUpperCase()) {
    case 'OPEN':
      return 'open';
    case 'MERGED':
      return 'merged';
    case 'CLOSED':
      return 'closed';
    default:
      return undefined;
  }
}

/**
 * The pull requests of a card (DEC-022 item 2): the closing ones and the ones that only refer to the
 * Issue, a pull request in both counted once. The first list is the closing ones, and each of them is
 * marked `closes` (TASK-114). The open ones come first, then the closing ones, then the newest (a
 * larger number is a newer pull request), at most three, so the pull request that ends the work is not
 * pushed out. Anything that is not a pull request with a number, an address, and a known state is left
 * out, so a page that refers to the Issue from an Issue or a discussion never shows up.
 */
export function mergeCardPulls(...lists: readonly (readonly RawPull[] | undefined)[]): CardPull[] {
  const byNumber = new Map<number, CardPull>();
  lists.forEach((list, index) => {
    for (const raw of list ?? []) {
      const state = stateOf(raw.state);
      if (typeof raw.number !== 'number' || typeof raw.url !== 'string' || !raw.url.includes('/pull/') || !state) continue;
      const closes = index === 0 || byNumber.get(raw.number)?.closes === true;
      byNumber.set(raw.number, { number: raw.number, url: raw.url, title: raw.title ?? '', state, ...(closes ? { closes: true } : {}) });
    }
  });
  const rank = (pull: CardPull): number => (pull.state === 'open' ? 0 : pull.closes ? 1 : 2);
  return [...byNumber.values()].sort((a, b) => rank(a) - rank(b) || b.number - a.number).slice(0, MAX_CARD_PULLS);
}
