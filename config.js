// Single source of truth for team size.
// Change this ONE value to switch the whole app from 2v2 to 4v4 (or any size).
// Everything else (team slots, pick order, draft order, start-draft checks)
// derives from this constant.
export const TEAM_SIZE = 4;

// Default number of bans per team when the host starts a draft without
// touching the Host Controls ban selector. The host can pick 0, 1 or 2.
export const DEFAULT_BAN_COUNT = 1;

// Auto-cleanup window, backed by a Firestore TTL policy on the `drafts`
// collection's `expiresAt` field (see README note next to its usage).
// A draft still in the lobby/draft phase gets its expiresAt pushed
// forward by this much on every meaningful action; once it's marked
// "finished" it instead gets a fixed window from that moment.
export const INACTIVITY_MS = 60 * 60 * 1000; // 1 hour
export const FINISHED_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

// The whole match is a best-of-N: whichever team wins WINS_NEEDED
// games first takes the match. A new character draft happens before
// every game; the map veto (mapVeto.js) happens once, before game 1.
export const BEST_OF = 3;
export const WINS_NEEDED = Math.ceil(BEST_OF / 2);
