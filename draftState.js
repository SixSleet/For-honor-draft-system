/**
 * Builds the initial Firestore match document (see FIRESTORE STRUCTURE).
 * This is the ONLY place the initial match shape is created — draft.js
 * calls this instead of building the object inline, so the shape never
 * drifts between callers.
 *
 * A match is a best-of-N: the map veto runs once, then each game gets
 * its own fresh character draft, a host-declared winner, and (if the
 * match isn't decided yet) a map pick by the loser before the next
 * game's draft. Captains, rosters, the ban count and bestOf are chosen
 * once in the lobby and never change across games — only the per-game
 * fields (turn/phase/activeTeam/activePlayer/bans/picks) get reset
 * between games, by resetGameState() below.
 *
 * Since the captain performs every ban AND pick for their team,
 * activePlayer is always a captain ID — there's no separate pick order
 * to track.
 *
 * banCount (0, 1 or 2), bestOf (1, 3 or 5), and firstTeam ("Blue" or
 * "Red") are chosen by the host in Host Controls and stored on the
 * match doc so confirmAction() can rebuild the exact same character
 * draft order later via getDraftOrder(TEAM_SIZE, banCount, firstTeam),
 * confirmMapAction() can do the same for getMapVetoOrder(firstTeam),
 * and declareGameWinner() knows how many wins (Math.ceil(bestOf / 2))
 * end the match. firstTeam goes first in the map veto and Game 1's
 * draft — after that, declareGameWinner() overwrites it with the
 * LOSER of each game, so losing a game earns first ban/pick in the
 * next one (same idea as "loser picks the next map").
 */
export function createInitialMatch(bluePlayers, redPlayers, blueCaptain, redCaptain, banCount = 1, bestOf = 3, firstTeam = "Blue") {
    return {
        status: "mapVeto",

        scoreBlue: 0,
        scoreRed: 0,
        gameNumber: 1,

        banCount,
        bestOf,
        firstTeam,

        blueCaptain,
        redCaptain,

        bluePlayers: bluePlayers.map(p => p.id),
        redPlayers: redPlayers.map(p => p.id),

        // Map veto/pick state
        mapBans: [],
        mapHistory: [],
        currentMap: null,
        pendingMapAction: null,

        // Map veto reuses turn/phase/activeTeam/activePlayer below to
        // drive its own 3-step order (see mapVeto.js) before the first
        // character draft ever starts.
        turn: 0,
        phase: "Ban",
        activeTeam: firstTeam,
        activePlayer: firstTeam === "Blue" ? blueCaptain : redCaptain,

        // Character draft state (unused until the map veto finishes)
        bans: [],
        picks: [],
        pendingAction: null
    };
}

/**
 * Fields to reset on the match doc at the start of every game's
 * character draft — both the very first one (right after the map
 * veto) and every subsequent one (right after the loser picks the
 * next map). Captains/rosters/banCount are untouched since they don't
 * change between games. firstTeam is passed in fresh each time — by
 * this point declareGameWinner() has already set it to the previous
 * game's loser (except for Game 1, where it's still the host's
 * original choice).
 */
export function resetGameState(blueCaptain, redCaptain, banCount, firstTeam = "Blue") {
    return {
        turn: 0,
        phase: banCount > 0 ? "Ban" : "Pick",
        activeTeam: firstTeam,
        activePlayer: firstTeam === "Blue" ? blueCaptain : redCaptain,
        bans: [],
        picks: [],
        pendingAction: null
    };
}

/**
 * Returns the playerID who is allowed to act right now.
 * Always the captain of the currently active team.
 */
export function getActivePlayer(draft) {
    if (!draft) return null;
    return draft.activeTeam === "Blue" ? draft.blueCaptain : draft.redCaptain;
}
