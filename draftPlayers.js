/**
 * The captain now performs every pick for their team, so there is no
 * longer a per-player pick sequence to compute — every step in
 * draftOrder.js just targets a team, and the team's captain acts.
 *
 * This file is kept (per the "keep compatible" file list) as a small
 * display helper for anything that wants an ordered team roster, e.g.
 * showing team slots in join order.
 */
export function getTeamRoster(players) {
    return players.slice();
}
