/**
 * The map veto runs ONCE per match, before Game 1's character draft:
 *
 *   1. Blue Captain bans a map.
 *   2. Red Captain bans a map.
 *   3. Red Captain — the team that banned second — picks the first
 *      map to play. It cannot be either banned map.
 *
 * Unlike the character draft order (draftOrder.js), this never scales
 * with team size or ban count — it's always exactly these 3 steps, so
 * there's no parameters, just a fixed order.
 *
 * Maps for game 2 (and 3, if needed) aren't part of this order at all:
 * they're picked directly by the loser of the previous game
 * (draft.js's confirmMapAction, status "mapPick").
 */
export function getMapVetoOrder() {
    return [
        { type: "Ban", team: "Blue" },
        { type: "Ban", team: "Red" },
        { type: "Pick", team: "Red" }
    ];
}
