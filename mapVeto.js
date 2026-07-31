/**
 * The map veto runs ONCE per match, before Game 1's character draft:
 *
 *   1. firstTeam Captain bans a map.
 *   2. The other team's Captain bans a map.
 *   3. The other team — the one that banned second — picks the first
 *      map to play. It cannot be either banned map.
 *
 * firstTeam is chosen by the host in Host Controls (defaults to Blue,
 * same as the character draft's firstTeam — see draftOrder.js).
 *
 * Unlike the character draft order (draftOrder.js), this never scales
 * with team size or ban count — it's always exactly these 3 steps.
 *
 * Maps for game 2 (and 3, if needed) aren't part of this order at all:
 * they're picked directly by the loser of the previous game
 * (draft.js's confirmMapAction, status "mapPick").
 */
export function getMapVetoOrder(firstTeam = "Blue") {
    const secondTeam = firstTeam === "Blue" ? "Red" : "Blue";

    return [
        { type: "Ban", team: firstTeam },
        { type: "Ban", team: secondTeam },
        { type: "Pick", team: secondTeam }
    ];
}
