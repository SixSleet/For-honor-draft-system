import { TEAM_SIZE } from "./config.js";

/**
 * Builds the full sequence of draft steps.
 *
 * The CAPTAIN performs every action for their team — bans AND picks.
 * Teammates only spectate. So every step only needs a team, never an
 * individual player slot.
 *
 * banCount (0, 1 or 2 — Host Controls) is the number of separate ban
 * ROUNDS, each a single ban per team (firstTeam bans, then the other
 * team — chosen by the host, defaults to Blue). The teamSize*2 picks
 * are split evenly across banCount pick blocks sitting after each ban
 * round, so more ban rounds means more (shorter) breaks in the picks
 * rather than one giant ban phase up front — this is what makes
 * banCount=2 stay a "ban, pick some, ban again, pick the rest" match
 * instead of collapsing into the same shape as banCount=1.
 *
 * e.g. for teamSize=4, firstTeam="Blue":
 *   banCount=0: P1 P2 P1 P2 P1 P2 P1 P2                    (no bans at all)
 *   banCount=1: B1 B2 | P1 P2 P1 P2 P1 P2 P1 P2             (one ban round, then every pick)
 *   banCount=2: B1 B2 | P1 P2 P1 P2 | B1 B2 | P1 P2 P1 P2   (two ban rounds, picks split between them)
 * (B1/P1 = Blue ban/pick, B2/P2 = Red ban/pick. Swap firstTeam to "Red"
 * and every B1/P1 <-> B2/P2 label swaps too.)
 *
 * teamSize defaults to config.TEAM_SIZE, so changing that one value
 * automatically produces a correctly-sized order (e.g. 4v4 = 4 pick
 * rounds per side instead of 2) — as long as teamSize*2 divides evenly
 * by banCount, which holds for every banCount Host Controls offers.
 */
export function getDraftOrder(teamSize = TEAM_SIZE, banCount = 1, firstTeam = "Blue") {
    const secondTeam = firstTeam === "Blue" ? "Red" : "Blue";
    const totalPicks = teamSize * 2;

    if (banCount === 0) {
        return Array.from({ length: totalPicks }, (_, i) => ({
            type: "Pick",
            team: i % 2 === 0 ? firstTeam : secondTeam
        }));
    }

    const picksPerBlock = totalPicks / banCount;
    const order = [];

    for (let round = 0; round < banCount; round++) {
        order.push({ type: "Ban", team: firstTeam });
        order.push({ type: "Ban", team: secondTeam });

        for (let p = 0; p < picksPerBlock; p++) {
            order.push({ type: "Pick", team: p % 2 === 0 ? firstTeam : secondTeam });
        }
    }

    return order;
}

// Kept for compatibility with any code that still imports the static array
// directly. Represents the order for the current TEAM_SIZE with the
// default ban count (1 per team) and Blue going first.
export const draftOrder = getDraftOrder();
