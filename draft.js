import {
    db,
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    Timestamp
} from "./firebase.js";

import { TEAM_SIZE, INACTIVITY_MS, FINISHED_TTL_MS, TURN_TIME_MS } from "./config.js";
import { getDraftOrder } from "./draftOrder.js";
import { getMapVetoOrder } from "./mapVeto.js";
import { createInitialMatch, resetGameState } from "./draftState.js";

function inactivityExpiry() {
    return Timestamp.fromMillis(Date.now() + INACTIVITY_MS);
}

// Deadline for the CURRENT active player's ban/pick (character draft) or
// map ban/pick (veto and between-game map picks). Refreshed every time
// the active turn advances; app.js counts it down for everyone and, once
// it passes, has the active captain's own client auto-select a random
// available option so the match can't stall forever on an idle captain.
function turnExpiry() {
    return Timestamp.fromMillis(Date.now() + TURN_TIME_MS);
}

/**
 * Starts the match: writes the initial match document built by
 * draftState.js onto the existing lobby document. Kicks off in the
 * "mapVeto" status — the character draft doesn't start until the map
 * veto picks Game 1's map.
 */
export async function createDraft(lobby, bluePlayers, redPlayers, blueCaptain, redCaptain, banCount = 1, bestOf = 3, firstTeam = "Blue") {
    const initialMatch = createInitialMatch(bluePlayers, redPlayers, blueCaptain, redCaptain, banCount, bestOf, firstTeam);

    await updateDoc(doc(db, "drafts", lobby), {
        ...initialMatch,
        turnDeadline: turnExpiry(),
        expiresAt: inactivityExpiry()
    });
}

/**
 * Subscribes to real-time updates of the match document.
 * callback(matchData) fires on every change.
 */
export function listenDraft(lobby, callback) {
    return onSnapshot(doc(db, "drafts", lobby), snap => {
        if (snap.exists()) {
            callback(snap.data());
        }
    });
}

// ---------------------------------------------------------------------
// Character draft (one fresh draft per game)
// ---------------------------------------------------------------------

/**
 * Called when the active captain picks/bans a character but has not
 * yet confirmed. Only the team captain is ever draft.activePlayer, so
 * this implicitly blocks teammates from acting — they can only
 * spectate.
 */
export async function selectCharacter(lobby, playerID, character) {
    const ref = doc(db, "drafts", lobby);
    const snap = await getDoc(ref);
    const draft = snap.data();

    if (!draft || draft.status !== "draft") return;

    if (draft.activePlayer !== playerID) {
        alert("Only your team's captain can do this");
        return;
    }

    const alreadyUsed =
        draft.bans.some(b => b.character === character) ||
        draft.picks.some(p => p.character === character);

    if (alreadyUsed) {
        alert("Character unavailable");
        return;
    }

    await updateDoc(ref, {
        pendingAction: {
            player: playerID,
            character: character
        }
    });
}

/**
 * Commits the pendingAction (ban or pick), then advances the draft to
 * the next step using the order from draftOrder.js. Once the order is
 * exhausted, the GAME is done (not the whole match) — status moves to
 * "gameResult" so the host can record who won. The next active player
 * (mid-game) is always the next step's team captain.
 */
export async function confirmAction(lobby, playerID) {
    const ref = doc(db, "drafts", lobby);
    const snap = await getDoc(ref);
    const draft = snap.data();

    if (!draft) return;

    if (!draft.pendingAction || draft.pendingAction.player !== playerID) {
        return;
    }

    const bans = draft.bans || [];
    const picks = draft.picks || [];

    if (draft.phase === "Ban") {
        bans.push({
            team: draft.activeTeam,
            character: draft.pendingAction.character
        });
    } else {
        picks.push({
            team: draft.activeTeam,
            player: playerID,
            character: draft.pendingAction.character
        });
    }

    const order = getDraftOrder(TEAM_SIZE, draft.banCount ?? 1, draft.firstTeam ?? "Blue");
    const nextTurn = draft.turn + 1;
    const next = order[nextTurn];

    // Draft order exhausted -> this game's draft is complete, waiting
    // on the host to declare a winner.
    if (!next) {
        await updateDoc(ref, {
            status: "gameResult",
            phase: "Complete",
            activePlayer: null,
            bans,
            picks,
            pendingAction: null,
            expiresAt: inactivityExpiry()
        });
        return;
    }

    const nextPlayer = next.team === "Blue" ? draft.blueCaptain : draft.redCaptain;

    await updateDoc(ref, {
        turn: nextTurn,
        phase: next.type,
        activeTeam: next.team,
        activePlayer: nextPlayer,
        bans,
        picks,
        pendingAction: null,
        turnDeadline: turnExpiry(),
        expiresAt: inactivityExpiry()
    });
}

// ---------------------------------------------------------------------
// Map veto (once per match) & map pick (before each later game)
// ---------------------------------------------------------------------

/**
 * Called when the active captain selects a map but has not yet
 * confirmed — used both for the pre-match veto (banning/picking Game
 * 1's map) and for a losing captain picking the next game's map.
 * Shares one availability rule: a map already banned or already
 * played this match can't be selected for anything.
 */
export async function selectMap(lobby, playerID, map) {
    const ref = doc(db, "drafts", lobby);
    const snap = await getDoc(ref);
    const draft = snap.data();

    if (!draft || (draft.status !== "mapVeto" && draft.status !== "mapPick")) return;

    if (draft.activePlayer !== playerID) {
        alert("Only your team's captain can do this");
        return;
    }

    const unavailable =
        (draft.mapBans || []).some(b => b.map === map) ||
        (draft.mapHistory || []).some(h => h.map === map);

    if (unavailable) {
        alert("Map unavailable");
        return;
    }

    await updateDoc(ref, {
        pendingMapAction: {
            player: playerID,
            map: map
        }
    });
}

/**
 * Commits the pendingMapAction. Branches on status:
 *  - "mapVeto": advances the fixed 3-step order from mapVeto.js. The
 *    first two steps are bans; the third is Red's pick of Game 1's
 *    map, which starts that game's character draft immediately.
 *  - "mapPick": the loser's single map pick for the next game — also
 *    starts that game's character draft immediately.
 */
export async function confirmMapAction(lobby, playerID) {
    const ref = doc(db, "drafts", lobby);
    const snap = await getDoc(ref);
    const draft = snap.data();

    if (!draft || !draft.pendingMapAction || draft.pendingMapAction.player !== playerID) {
        return;
    }

    const map = draft.pendingMapAction.map;

    if (draft.status === "mapPick") {
        const mapHistory = draft.mapHistory || [];

        mapHistory.push({ gameNumber: draft.gameNumber, map, winner: null });

        await updateDoc(ref, {
            currentMap: map,
            mapHistory,
            pendingMapAction: null,
            status: "draft",
            ...resetGameState(draft.blueCaptain, draft.redCaptain, draft.banCount ?? 1, draft.firstTeam ?? "Blue"),
            turnDeadline: turnExpiry(),
            expiresAt: inactivityExpiry()
        });
        return;
    }

    // status === "mapVeto"
    const mapBans = draft.mapBans || [];

    if (draft.phase === "Ban") {
        mapBans.push({ team: draft.activeTeam, map });
    }

    const order = getMapVetoOrder(draft.firstTeam ?? "Blue");
    const nextTurn = draft.turn + 1;
    const next = order[nextTurn];

    // Veto order exhausted -> this last step was Red's Game 1 map pick.
    if (!next) {
        await updateDoc(ref, {
            mapBans,
            currentMap: map,
            mapHistory: [{ gameNumber: 1, map, winner: null }],
            pendingMapAction: null,
            status: "draft",
            ...resetGameState(draft.blueCaptain, draft.redCaptain, draft.banCount ?? 1, draft.firstTeam ?? "Blue"),
            turnDeadline: turnExpiry(),
            expiresAt: inactivityExpiry()
        });
        return;
    }

    await updateDoc(ref, {
        mapBans,
        turn: nextTurn,
        phase: next.type,
        activeTeam: next.team,
        activePlayer: next.team === "Blue" ? draft.blueCaptain : draft.redCaptain,
        pendingMapAction: null,
        turnDeadline: turnExpiry(),
        expiresAt: inactivityExpiry()
    });
}

// ---------------------------------------------------------------------
// Host: declare the winner of the current game
// ---------------------------------------------------------------------

/**
 * Host-only action (gated client-side, like startDraft): records which
 * team won the just-finished game, updates the match score, and either
 * ends the match (a team reached the winsNeeded for this match's
 * bestOf) or hands the next map pick to the loser.
 */
export async function declareGameWinner(lobby, winnerTeam) {
    const ref = doc(db, "drafts", lobby);
    const snap = await getDoc(ref);
    const draft = snap.data();

    if (!draft || draft.status !== "gameResult") return;

    const mapHistory = draft.mapHistory || [];
    const currentEntry = mapHistory[mapHistory.length - 1];

    if (currentEntry) {
        currentEntry.winner = winnerTeam;
    }

    const scoreBlue = (draft.scoreBlue || 0) + (winnerTeam === "Blue" ? 1 : 0);
    const scoreRed = (draft.scoreRed || 0) + (winnerTeam === "Red" ? 1 : 0);
    const winsNeeded = Math.ceil((draft.bestOf || 3) / 2);

    if (scoreBlue >= winsNeeded || scoreRed >= winsNeeded) {
        await updateDoc(ref, {
            status: "finished",
            scoreBlue,
            scoreRed,
            mapHistory,
            activePlayer: null,
            expiresAt: Timestamp.fromMillis(Date.now() + FINISHED_TTL_MS)
        });
        return;
    }

    const loserTeam = winnerTeam === "Blue" ? "Red" : "Blue";

    await updateDoc(ref, {
        status: "mapPick",
        scoreBlue,
        scoreRed,
        mapHistory,
        gameNumber: (draft.gameNumber || 1) + 1,
        activeTeam: loserTeam,
        activePlayer: loserTeam === "Blue" ? draft.blueCaptain : draft.redCaptain,
        pendingMapAction: null,
        turnDeadline: turnExpiry(),
        expiresAt: inactivityExpiry()
    });
}
