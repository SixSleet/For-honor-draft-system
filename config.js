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

// The whole match is a best-of-N, chosen by the host in Host Controls
// (1, 3 or 5) and stored per-match as draft.bestOf — whichever team
// wins Math.ceil(bestOf / 2) games first takes the match. Used only as
// the default the "Best of" selector starts on. A new character draft
// happens before every game; the map veto (mapVeto.js) happens once,
// before game 1.
export const DEFAULT_BEST_OF = 3;

// How long the active captain has to make a ban/pick (character draft)
// or a map ban/pick (veto and between-game map picks) before the app
// auto-selects a random available option on their behalf. Refreshed on
// every turn advance (see draft.js's turnExpiry()).
export const TURN_TIME_MS = 2 * 60 * 1000; // 2 minutes

// Presence: there's no server, so "is this player still here" is done
// with a heartbeat — every connected client pings its own player doc
// this often. Any OTHER client that notices a player hasn't pinged in
// STALE_PLAYER_MS treats them as disconnected (closed the browser
// without clicking Leave Lobby) and removes them — see app.js's
// listenPlayers(). Kept well below STALE_PLAYER_MS so a couple of
// missed pings (a slow network tick, a backgrounded tab) don't get
// someone removed by mistake.
export const HEARTBEAT_MS = 20 * 1000; // 20 seconds
export const STALE_PLAYER_MS = 60 * 1000; // 60 seconds
