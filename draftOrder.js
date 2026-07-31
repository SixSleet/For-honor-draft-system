import { TEAM_SIZE } from "./config.js";

/**
 * Builds the full sequence of draft steps.
 *
 * The CAPTAIN performs every action for their team — bans AND picks.
 * Teammates only spectate. So every step only needs a team, never an
 * individual player slot.
 *
 * Two independent rules combine to produce every step:
 *
 *   1. TEAM strictly alternates every single step, regardless of what
 *      type that step is (firstTeam always goes on step 0 — chosen by
 *      the host in Host Controls, defaults to Blue).
 *   2. The step TYPES follow a fixed template: every ban happens first
 *      (both teams alternating), then every pick (both teams
 *      alternating) — no bans occur once picking has started.
 *          Ban x banCount x 2, Pick x teamSize x 2
 *
 * e.g. for teamSize=4, firstTeam="Blue":
 *   banCount=0: P P P P P P P P                  (Blue P, Red P, Blue P, ...)
 *   banCount=1: B B P P P P P P P P               -> B1 B2 P1 P2 P1 P2 P1 P2 P1 P2
 *   banCount=2: B B B B P P P P P P P P            -> B1 B2 B1 B2 P1 P2 P1 P2 P1 P2 P1 P2
 * (B1/P1 = Blue ban/pick, B2/P2 = Red ban/pick — matches the reference
 * draft order exactly. Swap firstTeam to "Red" and every B1/P1 <-> B2/P2
 * label swaps too.)
 *
 * teamSize defaults to config.TEAM_SIZE, so changing that one value
 * automatically produces a correctly-sized order (e.g. 4v4 = 4 pick
 * rounds per side instead of 2). banCount is chosen per-draft by the
 * host (Host Controls, 0/1/2) and defaults to 1 to match prior behavior.
 */
export function getDraftOrder(teamSize = TEAM_SIZE, banCount = 1, firstTeam = "Blue") {
    const secondTeam = firstTeam === "Blue" ? "Red" : "Blue";

    const typeTemplate = [
        ...Array(banCount * 2).fill("Ban"),
        ...Array(teamSize * 2).fill("Pick")
    ];

    return typeTemplate.map((type, i) => ({
        type,
        team: i % 2 === 0 ? firstTeam : secondTeam
    }));
}

// Kept for compatibility with any code that still imports the static array
// directly. Represents the order for the current TEAM_SIZE with the
// default ban count (1 per team) and Blue going first.
export const draftOrder = getDraftOrder();
