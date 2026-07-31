/**
 * Builds the initial Firestore match document (see FIRESTORE STRUCTURE).
 * This is the ONLY place the initial match shape is created — draft.js
 * calls this instead of building the object inline, so the shape never
 * drifts between callers.
 *
 * A match is a best-of-N (config.BEST_OF): the map veto runs once,
 * then each game gets its own fresh character draft, a host-declared
 * winner, and (if the match isn't decided yet) a map pick by the
 * loser before the next game's draft. Captains, rosters and the ban
 * count are chosen once in the lobby and never change across games —
 * only the per-game fields (turn/phase/activeTeam/activePlayer/
 * bans/picks) get reset between games, by resetGameState() below.
 *
 * Since the captain performs every ban AND pick for their team,
 * activePlayer is always a captain ID — there's no separate pick order
 * to track.
 *
 * banCount (0, 1 or 2) is chosen by the host in Host Controls and is
 * stored on the match doc so confirmAction() can rebuild the exact
 * same character draft order later via getDraftOrder(TEAM_SIZE, banCount).
 */
export function createInitialMatch(bluePlayers, redPlayers, blueCaptain, redCaptain, banCount = 1) {
    return {
        status: "mapVeto",

        scoreBlue: 0,
        scoreRed: 0,
        gameNumber: 1,

        banCount,

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
        activeTeam: "Blue",
        activePlayer: blueCaptain,

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
 * change between games.
 */
export function resetGameState(blueCaptain, banCount) {
    return {
        turn: 0,
        phase: banCount > 0 ? "Ban" : "Pick",
        activeTeam: "Blue",
        activePlayer: blueCaptain,
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
