import {
    db,
    doc,
    setDoc,
    getDoc,
    getDocs,
    collection,
    onSnapshot,
    updateDoc,
    deleteDoc,
    Timestamp
} from "./firebase.js";

import { charactersByFaction, characterImageSrc } from "./characters.js";
import { maps, mapImageSrc } from "./maps.js";
import { TEAM_SIZE, INACTIVITY_MS, DEFAULT_BEST_OF } from "./config.js";

import {
    createDraft,
    listenDraft,
    selectCharacter,
    confirmAction,
    selectMap,
    confirmMapAction,
    declareGameWinner
} from "./draft.js";

// ---------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------

let playerID = sessionStorage.getItem("playerID");

if (!playerID) {
    playerID = crypto.randomUUID();
    sessionStorage.setItem("playerID", playerID);
}

let playerName = "";
let currentLobby = null;
let isHost = false;
let selectedCharacter = null;
let selectedMap = null;
let selectedBanCount = 1;
let selectedBestOf = DEFAULT_BEST_OF;

// Reveal-animation bookkeeping: how many bans/picks/map-bans/map-picks
// we've already rendered, so we only animate genuinely NEW entries —
// never replay a reveal for history that already existed when this
// client (re)joined. See animateReveal()/renderDraftHistory()/
// renderMapStatusBar().
let lastBansCount = 0;
let lastPicksCount = 0;
let lastMapBansCount = 0;
let lastMapPicksCount = 0;
let matchAnimationsReady = false;

// Tracks the current match status ("lobby" | "mapVeto" | "draft" |
// "gameResult" | "mapPick" | "finished") so the captain-selection UI
// knows when to hide itself.
let draftStatus = "lobby";

// playerID -> name, kept up to date by listenPlayers() so the draft UI
// can show human-readable names where needed.
let playerNames = {};

// ---------------------------------------------------------------------
// Live lobby state
// ---------------------------------------------------------------------
// The lobby doc (captains, host) and the players collection (rosters)
// update independently and on their own Firestore listeners. Both are
// cached here and EVERY change from EITHER listener re-runs the same
// renderLobbyUI() pass, so a captain change is reflected immediately
// even if no player joined/left, and a roster change always uses the
// latest known captains.
let lastLobbyData = null;
let lastBlue = [];
let lastRed = [];
let lastNeutral = [];

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function generateCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function inactivityExpiry() {
    return Timestamp.fromMillis(Date.now() + INACTIVITY_MS);
}

// A Firestore TTL policy on drafts.expiresAt (set up once in the
// Firebase console/CLI, not in this code) eventually purges expired
// lobbies even if nobody ever comes back to them. This check exists
// for the common case where someone DOES come back to an expired
// code: it deletes it immediately instead of silently reviving a
// stale session, and cleans up the players subcollection, which the
// TTL sweep alone can't reach (Firestore never cascade-deletes
// subcollections).
function isExpired(lobbyData) {
    return !!lobbyData?.expiresAt && lobbyData.expiresAt.toMillis() <= Date.now();
}

async function deleteLobbyCompletely(code) {
    const playersSnap = await getDocs(collection(db, "drafts", code, "players"));

    await Promise.all(playersSnap.docs.map(playerDoc => deleteDoc(playerDoc.ref)));
    await deleteDoc(doc(db, "drafts", code));
}

// Bumps the inactivity window on any meaningful pre-draft lobby action.
// Guarded to the "lobby" phase so it can never shrink a finished
// match's longer cleanup window.
async function touchActivity(code) {
    if (draftStatus !== "lobby") return;

    await updateDoc(doc(db, "drafts", code), {
        expiresAt: inactivityExpiry()
    });
}

// <img> that tries the downloaded artwork (images/characters/<slug>.png),
// falls back to a hand-added .jpg with the same slug, and finally just
// removes itself so the surrounding card/gradient still looks fine.
function characterImgTag(name, cssClass) {
    const jpgFallback = characterImageSrc(name, "jpg");

    return `<img class="${cssClass}" src="${characterImageSrc(name, "png")}" alt=""
                data-fallback="${jpgFallback}"
                onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');}else{this.remove();}">`;
}

// Shared "hero card" markup: a square base tile with the character's
// name pinned to the bottom, used by the selection grid and the final
// results.
function characterCardHTML(name, size = "md") {
    return `
        <div class="charCard ${size}">
            ${characterImgTag(name, "charArt")}
            <span class="charLabel">${name}</span>
        </div>
    `;
}

// Same idea as characterImgTag/characterCardHTML, for maps
// (images/maps/<slug>.png, falling back to .jpg then the plain
// gradient tile).
function mapImgTag(name, cssClass) {
    const jpgFallback = mapImageSrc(name, "jpg");

    return `<img class="${cssClass}" src="${mapImageSrc(name, "png")}" alt=""
                data-fallback="${jpgFallback}"
                onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback');}else{this.remove();}">`;
}

function mapCardHTML(name, size = "md") {
    return `
        <div class="mapCard ${size}">
            ${mapImgTag(name, "mapArt")}
            <span class="mapLabel">${name}</span>
        </div>
    `;
}

// Shows `name`'s card big and centered, then flies it to targetEl's
// actual position/size before revealing the real (already-rendered)
// card there. targetEl is hidden (visibility, not display, so layout
// doesn't shift) for the duration so it doesn't show twice.
function animateReveal(name, kind, targetEl, aspect) {
    if (!targetEl) return;

    const imgTag = kind === "character" ? characterImgTag(name, "revealArt") : mapImgTag(name, "revealArt");
    const overlay = document.getElementById("revealOverlay");
    const card = document.getElementById("revealCard");

    card.innerHTML = `${imgTag}<span class="revealLabel">${name}</span>`;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bigW = Math.min(240, vw * 0.7);
    const bigH = bigW / aspect;

    targetEl.style.visibility = "hidden";
    overlay.hidden = false;
    overlay.classList.add("dim");

    card.style.transition = "none";
    card.style.left = (vw / 2 - bigW / 2) + "px";
    card.style.top = (vh / 2 - bigH / 2) + "px";
    card.style.width = bigW + "px";
    card.style.height = bigH + "px";
    card.style.opacity = "0";
    card.style.transform = "scale(.6)";

    void card.offsetWidth; // force reflow so the "none" transition above actually applies first

    card.style.transition = "transform .3s cubic-bezier(.34,1.56,.64,1), opacity .25s ease";
    card.style.opacity = "1";
    card.style.transform = "scale(1)";

    setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();

        card.style.transition = "left .5s cubic-bezier(.65,0,.35,1), top .5s cubic-bezier(.65,0,.35,1), width .5s ease, height .5s ease, opacity .35s ease .3s";
        card.style.left = rect.left + "px";
        card.style.top = rect.top + "px";
        card.style.width = rect.width + "px";
        card.style.height = rect.height + "px";
        overlay.classList.remove("dim");

        setTimeout(() => {
            card.style.opacity = "0";
        }, 350);

        setTimeout(() => {
            overlay.hidden = true;
            targetEl.style.visibility = "";
        }, 600);
    }, 850);
}

function showPlayerBadge() {
    document.getElementById("playerDisplay").hidden = false;
    document.getElementById("playerDisplay").innerHTML =
        `Player<br><strong>${playerName}</strong>`;
}

// Keeps "Become Captain" + host's "Start Draft" visible ONLY while the
// lobby is still in the "lobby" phase. Once the match starts (or
// finishes) both disappear for everyone, permanently, for that match.
function applyLobbyUIState() {
    const stillInLobby = draftStatus === "lobby";

    document.getElementById("captainSection").hidden = !stillInLobby;
    document.getElementById("hostControls").hidden = !(stillInLobby && isHost);
}

// Sets the shared turn banner's team-colored styling + title/subtitle.
// team may be null (e.g. match finished) for the neutral gold style.
// phaseType ("ban"|"pick"|null) adds a matching class — "ban" wins out
// over the team color (red, everywhere) since banning vs. picking is
// exactly the distinction that's easy to lose track of mid-draft.
function setTurnBanner(team, title, subtitle, phaseType) {
    const banner = document.getElementById("draftTurn");

    banner.className = `turnBanner${team ? " " + team.toLowerCase() + "Side" : ""}${phaseType ? " " + phaseType + "Phase" : ""}`;
    banner.innerHTML = `
        <span class="turnTeam">${title}</span>
        ${subtitle ? `<span class="turnPhase">${subtitle}</span>` : ""}
    `;
}

// Every phase-specific block starts hidden on each render; the active
// status branch below re-shows only what it needs. Prevents stale
// leftovers from a previous phase lingering on screen.
function hideAllPhaseUI() {
    document.getElementById("banPickStatus").hidden = true;
    document.getElementById("mapSelection").hidden = true;
    document.getElementById("gameResultControls").hidden = true;
    document.getElementById("characters").hidden = true;
    document.getElementById("matchSummary").hidden = true;
    document.getElementById("bansMiddle").hidden = true;
    document.getElementById("picksSection").hidden = true;
}

// blueTeamName/redTeamName live on the same drafts/{code} doc throughout
// the whole lobby -> match lifecycle, so this works whether it's given
// the lobby doc or the match doc — falls back to the plain color name
// until a captain sets something custom.
function teamDisplayName(data, team) {
    const name = team === "Blue" ? data?.blueTeamName : data?.redTeamName;
    return name || team;
}

// ---------------------------------------------------------------------
// Ban flash — a big red "BAN" announcement shown the instant a ban
// phase begins, before that phase's selection UI becomes interactive.
// ---------------------------------------------------------------------

let lastBanFlashKey = null;

function showBanFlash() {
    return new Promise(resolve => {
        const overlay = document.getElementById("banFlashOverlay");

        overlay.hidden = false;
        overlay.classList.remove("show");

        requestAnimationFrame(() => {
            overlay.classList.add("show");
        });

        setTimeout(() => {
            overlay.classList.remove("show");

            setTimeout(() => {
                overlay.hidden = true;
                resolve();
            }, 300);
        }, 900);
    });
}

// Fires once per distinct ban step (keyed by status+game+turn, since
// "turn" alone is reused across map veto and every game's character
// draft), then resolves immediately for every other render of that
// same step and for anything that isn't a ban at all.
function maybeFlashBan(draft) {
    if (draft.phase !== "Ban") return Promise.resolve();

    const key = `${draft.status}:${draft.gameNumber ?? 0}:${draft.turn ?? 0}`;

    if (key === lastBanFlashKey) return Promise.resolve();

    lastBanFlashKey = key;

    return showBanFlash();
}

// ---------------------------------------------------------------------
// Lobby: create / join
// ---------------------------------------------------------------------

document.getElementById("create").onclick = async () => {
    const name = document.getElementById("name").value.trim();

    if (!name) {
        alert("Enter your name first");
        return;
    }

    const code = generateCode();

    await setDoc(doc(db, "drafts", code), {
        hostID: playerID,
        status: "lobby",
        blueCaptain: null,
        redCaptain: null,
        expiresAt: inactivityExpiry()
    });

    await addPlayer(code, name);

    isHost = true;
    playerName = name;

    openLobby(code);
};

document.getElementById("join").onclick = async () => {
    const name = document.getElementById("name").value.trim();
    const code = document.getElementById("code").value.trim().toUpperCase();

    if (!name) {
        alert("Enter your name first");
        return;
    }

    if (!code) {
        alert("Enter a lobby code");
        return;
    }

    const lobby = await getDoc(doc(db, "drafts", code));

    if (!lobby.exists()) {
        alert("Lobby not found");
        return;
    }

    if (isExpired(lobby.data())) {
        await deleteLobbyCompletely(code);
        alert("That lobby has expired");
        return;
    }

    await addPlayer(code, name);

    playerName = name;

    openLobby(code);
};

async function addPlayer(code, name) {
    await setDoc(doc(db, "drafts", code, "players", playerID), {
        id: playerID,
        name: name,
        team: "Neutral"
    });
}

function openLobby(code) {
    currentLobby = code;
    sessionStorage.setItem("currentLobby", code);

    document.getElementById("home").hidden = true;
    document.getElementById("draft").hidden = false;
    document.getElementById("leaveLobby").hidden = false;

    document.getElementById("lobby").innerHTML = "Lobby: " + code;

    showPlayerBadge();
    window.scrollTo(0, 0);

    listenPlayers(code);
    listenLobby(code);
    listenDraft(code, renderDraft);
}

// ---------------------------------------------------------------------
// Lobby state
// ---------------------------------------------------------------------

function listenLobby(code) {
    onSnapshot(doc(db, "drafts", code), snap => {
        const data = snap.data();

        if (!data) return;

        lastLobbyData = data;

        if (data.hostID === playerID) {
            isHost = true;
        }

        renderLobbyUI();
    });
}

function listenPlayers(code) {
    onSnapshot(collection(db, "drafts", code, "players"), snapshot => {
        const blue = [];
        const red = [];
        const neutral = [];

        snapshot.forEach(playerDoc => {
            const data = playerDoc.data();

            playerNames[data.id] = data.name;

            if (data.team === "Blue") blue.push(data);
            else if (data.team === "Red") red.push(data);
            else neutral.push(data);
        });

        lastBlue = blue;
        lastRed = red;
        lastNeutral = neutral;

        renderLobbyUI();
    });
}

// Single render pass for everything the lobby doc + players collection
// feed: team rosters, captain crowns/names, team names, and the
// spectator list. Called after EVERY update from either Firestore
// listener.
function renderLobbyUI() {
    renderTeam("blue", lastBlue, lastLobbyData?.blueCaptain);
    renderTeam("red", lastRed, lastLobbyData?.redCaptain);
    renderCaptainSummary(lastLobbyData, lastBlue, lastRed);
    renderTeamNames(lastLobbyData);

    document.getElementById("spectatorPanel").hidden = lastNeutral.length === 0;
    document.getElementById("neutral").innerHTML = lastNeutral
        .map(player => `<div class="neutralPlayer fadeIn">${player.name}</div>`)
        .join("");

    applyLobbyUIState();
}

// Team panel headings always show the custom name (falling back to
// "Blue"/"Red"); the small inline editor under a heading is visible
// only to that team's own captain, and only before the match starts.
function renderTeamNames(lobby) {
    document.getElementById("blueTeamHeading").textContent = `🔵 ${teamDisplayName(lobby, "Blue")}`;
    document.getElementById("redTeamHeading").textContent = `🔴 ${teamDisplayName(lobby, "Red")}`;

    const stillInLobby = draftStatus === "lobby";

    document.getElementById("blueNameEdit").hidden = !(stillInLobby && lobby?.blueCaptain === playerID);
    document.getElementById("redNameEdit").hidden = !(stillInLobby && lobby?.redCaptain === playerID);

    const blueInput = document.getElementById("blueNameInput");
    const redInput = document.getElementById("redNameInput");

    // Don't stomp on the input while its own captain is mid-typing.
    if (document.activeElement !== blueInput) {
        blueInput.value = lobby?.blueTeamName || "";
    }

    if (document.activeElement !== redInput) {
        redInput.value = lobby?.redTeamName || "";
    }
}

function renderCaptainSummary(lobby, blue, red) {
    const blueCaptainName = blue.find(p => p.id === lobby?.blueCaptain)?.name;
    const redCaptainName = red.find(p => p.id === lobby?.redCaptain)?.name;

    document.getElementById("blueCaptain").innerHTML = lobby?.blueCaptain
        ? `🔵 ${blueCaptainName || "Captain"} <span class="crown">👑</span>`
        : "🔵 No Captain";

    document.getElementById("redCaptain").innerHTML = lobby?.redCaptain
        ? `🔴 ${redCaptainName || "Captain"} <span class="crown">👑</span>`
        : "🔴 No Captain";
}

function renderTeam(id, players, captainID) {
    let html = "";

    for (let i = 0; i < TEAM_SIZE; i++) {
        if (players[i]) {
            html += `
                <div class="teamSlot filled fadeIn">
                    <span>${players[i].name}</span>
                    ${players[i].id === captainID ? '<span class="crown">👑</span>' : ""}
                </div>
            `;
        } else {
            const team = id === "blue" ? "Blue" : "Red";

            html += `
                <div class="teamSlot empty" onclick="joinTeam('${team}')">
                    <span>+ Join</span>
                </div>
            `;
        }
    }

    document.getElementById(id).innerHTML = html;
}

window.joinTeam = async function (team) {
    // The draft can now start with just the two captains present, so
    // partially-empty "+ Join" slots can persist into a live match —
    // don't let anyone actually join a team once it's underway.
    if (draftStatus !== "lobby") {
        alert("The draft has already started");
        return;
    }

    const players = await getDocs(collection(db, "drafts", currentLobby, "players"));

    let count = 0;

    players.forEach(playerDoc => {
        if (playerDoc.data().team === team) count++;
    });

    if (count >= TEAM_SIZE) {
        alert("Team full");
        return;
    }

    await updateDoc(doc(db, "drafts", currentLobby, "players", playerID), {
        team: team
    });

    // Leaving a team must give up that team's captaincy — otherwise a
    // player could defect to the other side while still controlling
    // their old team's bans/picks.
    const lobbyRef = doc(db, "drafts", currentLobby);
    const lobby = (await getDoc(lobbyRef)).data();

    if (lobby.blueCaptain === playerID && team !== "Blue") {
        await updateDoc(lobbyRef, { blueCaptain: null });
    }

    if (lobby.redCaptain === playerID && team !== "Red") {
        await updateDoc(lobbyRef, { redCaptain: null });
    }

    await touchActivity(currentLobby);
};

// ---------------------------------------------------------------------
// Captains
// ---------------------------------------------------------------------

document.getElementById("makeCaptain").onclick = async () => {
    const playerSnap = await getDoc(
        doc(db, "drafts", currentLobby, "players", playerID)
    );

    const player = playerSnap.data();

    if (!player) {
        alert("Player not found");
        return;
    }

    if (player.team === "Neutral") {
        alert("Join Blue or Red team first");
        return;
    }

    const lobbyRef = doc(db, "drafts", currentLobby);
    const lobbySnap = await getDoc(lobbyRef);
    const lobby = lobbySnap.data();

    if (lobby.blueCaptain === playerID || lobby.redCaptain === playerID) {
        alert("You are already a captain");
        return;
    }

    const captainField = player.team === "Blue" ? "blueCaptain" : "redCaptain";

    if (lobby[captainField]) {
        alert("This team already has a captain");
        return;
    }

    await updateDoc(lobbyRef, {
        [captainField]: playerID
    });

    await touchActivity(currentLobby);
};

// ---------------------------------------------------------------------
// Team names (each captain can rename their own team before the match starts)
// ---------------------------------------------------------------------

document.getElementById("saveBlueName").onclick = async () => {
    const name = document.getElementById("blueNameInput").value.trim().slice(0, 20);

    await updateDoc(doc(db, "drafts", currentLobby), { blueTeamName: name || "Blue" });
    await touchActivity(currentLobby);
};

document.getElementById("saveRedName").onclick = async () => {
    const name = document.getElementById("redNameInput").value.trim().slice(0, 20);

    await updateDoc(doc(db, "drafts", currentLobby), { redTeamName: name || "Red" });
    await touchActivity(currentLobby);
};

// ---------------------------------------------------------------------
// Ban count / Best-of selectors (host only, chosen before Start Draft)
// ---------------------------------------------------------------------

document.getElementById("banCountToggle").addEventListener("click", event => {
    const option = event.target.closest(".banOption");

    if (!option) return;

    selectedBanCount = Number(option.dataset.value);

    document.querySelectorAll("#banCountToggle .banOption").forEach(btn => {
        btn.classList.toggle("selected", btn === option);
    });
});

document.getElementById("bestOfToggle").addEventListener("click", event => {
    const option = event.target.closest(".banOption");

    if (!option) return;

    selectedBestOf = Number(option.dataset.value);

    document.querySelectorAll("#bestOfToggle .banOption").forEach(btn => {
        btn.classList.toggle("selected", btn === option);
    });
});

// ---------------------------------------------------------------------
// Start match (host only) — kicks off the map veto, not the character
// draft directly; the character draft only starts once Game 1's map
// is chosen.
// ---------------------------------------------------------------------

document.getElementById("startDraft").onclick = async () => {
    if (!isHost) return;

    const players = await getDocs(collection(db, "drafts", currentLobby, "players"));

    let blue = [];
    let red = [];

    players.forEach(playerDoc => {
        const data = playerDoc.data();

        if (data.team === "Blue") blue.push(data);
        if (data.team === "Red") red.push(data);
    });

    const lobby = (await getDoc(doc(db, "drafts", currentLobby))).data();

    if (
        !lobby.blueCaptain ||
        !lobby.redCaptain ||
        !blue.some(p => p.id === lobby.blueCaptain) ||
        !red.some(p => p.id === lobby.redCaptain)
    ) {
        alert("Both teams need their own captain before starting — the rest of the roster can fill in later");
        return;
    }

    await createDraft(currentLobby, blue, red, lobby.blueCaptain, lobby.redCaptain, selectedBanCount, selectedBestOf);
};

// ---------------------------------------------------------------------
// Match rendering — dispatches on status to the right phase renderer
// ---------------------------------------------------------------------

function renderDraft(draft) {
    if (!draft) return;

    draftStatus = draft.status || "lobby";
    applyLobbyUIState();

    document.getElementById("matchScore").hidden = draftStatus === "lobby";

    hideAllPhaseUI();

    if (draftStatus === "lobby") {
        // A brand new match is about to start (or none has yet) — make
        // sure the next one's reveals/flashes animate fresh instead of
        // treating its first bans/picks as "already seen".
        matchAnimationsReady = false;
        lastBansCount = 0;
        lastPicksCount = 0;
        lastMapBansCount = 0;
        lastMapPicksCount = 0;
        lastBanFlashKey = null;
        return;
    }

    renderMatchScore(draft);
    renderMapStatusBar(draft);
    renderDraftHistory(draft);
    matchAnimationsReady = true;

    if (draftStatus === "finished") {
        renderMatchFinished(draft);
        return;
    }

    if (draftStatus === "mapVeto" || draftStatus === "mapPick") {
        renderMapPhase(draft);
        return;
    }

    if (draftStatus === "gameResult") {
        renderGameResult(draft);
        return;
    }

    renderCharacterDraftPhase(draft);
}

function renderMatchScore(draft) {
    const bestOf = draft.bestOf ?? DEFAULT_BEST_OF;
    const winsNeeded = Math.ceil(bestOf / 2);

    document.getElementById("matchScore").innerHTML = `
        <span class="scoreLine">🔵 ${draft.scoreBlue ?? 0} — ${draft.scoreRed ?? 0} 🔴</span>
        <span class="gameLine">Game ${draft.gameNumber ?? 1} of ${bestOf} · First to ${winsNeeded}</span>
    `;
}

// Persistent "Banned Maps" / "Current Map" chip row — also the landing
// spot for the map reveal animation: a ban flies into bannedMapsList,
// a map pick (veto's Game 1 pick, or a loser's later pick) flies into
// currentMapChip.
function renderMapStatusBar(draft) {
    const bar = document.getElementById("mapStatusBar");
    const bannedList = document.getElementById("bannedMapsList");
    const currentChip = document.getElementById("currentMapChip");

    const mapBans = draft.mapBans || [];
    const mapHistory = draft.mapHistory || [];

    if (!mapBans.length && !draft.currentMap) {
        bar.hidden = true;
        lastMapBansCount = 0;
        lastMapPicksCount = 0;
        return;
    }

    bar.hidden = false;

    bannedList.innerHTML = mapBans.length
        ? mapBans.map(b => mapCardHTML(b.map, "sm")).join("")
        : '<span class="historyPlaceholder">—</span>';

    currentChip.innerHTML = draft.currentMap
        ? mapCardHTML(draft.currentMap, "sm")
        : '<span class="historyPlaceholder">—</span>';

    if (matchAnimationsReady && mapBans.length > lastMapBansCount) {
        animateReveal(mapBans[mapBans.length - 1].map, "map", bannedList.lastElementChild, 1.6);
    }

    if (matchAnimationsReady && mapHistory.length > lastMapPicksCount) {
        animateReveal(draft.currentMap, "map", currentChip.firstElementChild, 1.6);
    }

    lastMapBansCount = mapBans.length;
    lastMapPicksCount = mapHistory.length;
}

// ---------------------------------------------------------------------
// Map veto (once, before Game 1) & map pick (loser picks the next map)
// ---------------------------------------------------------------------

function renderMapPhase(draft) {
    const isActingCaptain = draft.activePlayer === playerID;
    const title = document.getElementById("mapSelectionTitle");
    const isBan = draft.status === "mapVeto" && draft.phase === "Ban";
    const activeTeamName = teamDisplayName(draft, draft.activeTeam);

    let bannerSubtitle;
    let waitingText;
    let titleText;

    if (draft.status === "mapVeto") {
        if (isBan) {
            bannerSubtitle = "🚫 BANNING a Map";
            waitingText = `🚫 ${activeTeamName} Captain is BANNING a map…`;
            titleText = "🚫 Ban a Map";
        } else {
            bannerSubtitle = "Picking Game 1's Map";
            waitingText = `${activeTeamName} Captain is picking Game 1's map…`;
            titleText = "Pick Game 1's Map";
        }
    } else {
        bannerSubtitle = `Game ${draft.gameNumber} — Picking Next Map`;
        waitingText = `${activeTeamName} Captain (loser of the last game) is picking the next map…`;
        titleText = `Pick Game ${draft.gameNumber}'s Map`;
    }

    setTurnBanner(draft.activeTeam, activeTeamName, bannerSubtitle, isBan ? "ban" : "pick");

    const mapSelection = document.getElementById("mapSelection");
    const statusArea = document.getElementById("banPickStatus");

    // The "BAN" flash (if this is a new ban step) plays before either
    // the interactive grid or the waiting banner shows up.
    maybeFlashBan(draft).then(() => {
        if (isActingCaptain) {
            title.textContent = titleText;
            mapSelection.hidden = false;
            mapSelection.className = isBan ? "banPhase" : "";
            renderMapGrid(draft);
            statusArea.hidden = true;
        } else {
            mapSelection.hidden = true;
            selectedMap = null;
            document.getElementById("confirmMap").hidden = true;

            statusArea.hidden = false;
            statusArea.className = `statusBanner fadeIn ${draft.activeTeam.toLowerCase()}Side${isBan ? " banPhase" : ""}`;
            statusArea.innerHTML = waitingText;
        }
    });
}

function renderMapGrid(draft) {
    const grid = document.getElementById("mapGrid");
    const isBan = draft.status === "mapVeto" && draft.phase === "Ban";

    grid.innerHTML = "";

    const bannedMaps = (draft.mapBans || []).map(b => b.map);
    const playedMaps = (draft.mapHistory || []).map(h => h.map);

    maps.forEach(map => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "mapOption";
        button.innerHTML = mapCardHTML(map, "md");

        if (bannedMaps.includes(map) || playedMaps.includes(map)) {
            button.disabled = true;
        }

        button.onclick = () => {
            selectedMap = map;

            document.querySelectorAll(".mapOption").forEach(btn => {
                btn.classList.remove("selected");
            });

            button.classList.add("selected");

            const confirmBtn = document.getElementById("confirmMap");
            confirmBtn.hidden = false;
            confirmBtn.textContent = isBan ? "🚫 Confirm Ban" : "Confirm Pick";
        };

        grid.appendChild(button);
    });
}

document.getElementById("confirmMap").onclick = async () => {
    if (!selectedMap) return;

    await selectMap(currentLobby, playerID, selectedMap);

    setTimeout(async () => {
        await confirmMapAction(currentLobby, playerID);
    }, 300);

    selectedMap = null;
    document.getElementById("confirmMap").hidden = true;
};

// ---------------------------------------------------------------------
// Game result (host declares the winner of the just-finished game)
// ---------------------------------------------------------------------

function renderGameResult(draft) {
    setTurnBanner(null, `Game ${draft.gameNumber} Complete`, "Awaiting result");

    const controls = document.getElementById("gameResultControls");
    const statusArea = document.getElementById("banPickStatus");

    document.getElementById("blueWon").textContent = `🔵 ${teamDisplayName(draft, "Blue")} Won`;
    document.getElementById("redWon").textContent = `🔴 ${teamDisplayName(draft, "Red")} Won`;

    if (isHost) {
        controls.hidden = false;
        statusArea.hidden = true;
    } else {
        controls.hidden = true;
        statusArea.hidden = false;
        statusArea.className = "statusBanner fadeIn";
        statusArea.innerHTML = "Waiting for the host to record the winner…";
    }
}

document.getElementById("blueWon").onclick = async () => {
    if (!isHost) return;
    await declareGameWinner(currentLobby, "Blue");
};

document.getElementById("redWon").onclick = async () => {
    if (!isHost) return;
    await declareGameWinner(currentLobby, "Red");
};

// ---------------------------------------------------------------------
// Character draft (fresh each game)
// ---------------------------------------------------------------------

function renderCharacterDraftPhase(draft) {
    const isCaptainTurn = draft.activePlayer === playerID;
    const isBan = draft.phase === "Ban";
    const activeTeamName = teamDisplayName(draft, draft.activeTeam);

    const phaseLabel = isBan ? "🚫 BANNING" : "Pick Phase";
    const mapLabel = draft.currentMap ? ` · ${draft.currentMap}` : "";

    setTurnBanner(draft.activeTeam, activeTeamName, phaseLabel + mapLabel, isBan ? "ban" : "pick");

    const charactersArea = document.getElementById("characters");
    const statusArea = document.getElementById("banPickStatus");

    // The "BAN" flash (if this is a new ban step) plays before either
    // the character grid or the waiting banner shows up.
    maybeFlashBan(draft).then(() => {
        if (isCaptainTurn) {
            charactersArea.hidden = false;
            charactersArea.className = `active ${draft.activeTeam.toLowerCase()}Side${isBan ? " banPhase" : ""}`;
            statusArea.hidden = true;

            renderCharacterButtons(draft);
        } else {
            charactersArea.hidden = true;
            selectedCharacter = null;
            document.getElementById("confirmPick").hidden = true;

            statusArea.hidden = false;
            statusArea.className = `statusBanner fadeIn ${draft.activeTeam.toLowerCase()}Side${isBan ? " banPhase" : ""}`;
            statusArea.innerHTML = `${activeTeamName} Captain is ${
                isBan ? "🚫 BANNING…" : "picking…"
            }`;
        }
    });
}

function renderCharacterButtons(draft) {
    const grid = document.getElementById("characterGrid");

    grid.innerHTML = "";

    charactersByFaction.forEach(({ faction, heroes }) => {
        const section = document.createElement("div");
        section.className = "factionSection";

        const heading = document.createElement("h4");
        heading.className = "factionHeading";
        heading.textContent = faction;
        section.appendChild(heading);

        const factionGrid = document.createElement("div");
        factionGrid.className = "factionGrid";

        heroes.forEach(character => {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "character";
            button.innerHTML = characterCardHTML(character, "md");

            const banned = draft.bans.some(b => b.character === character);
            const picked = draft.picks.some(p => p.character === character);

            if (banned || picked) {
                button.disabled = true;
            }

            button.onclick = () => {
                selectedCharacter = character;

                document.querySelectorAll(".character").forEach(btn => {
                    btn.classList.remove("selected");
                });

                button.classList.add("selected");

                const confirmBtn = document.getElementById("confirmPick");
                confirmBtn.hidden = false;
                confirmBtn.textContent = draft.phase === "Ban" ? "🚫 Confirm Ban" : "Confirm Pick";
            };

            factionGrid.appendChild(button);
        });

        section.appendChild(factionGrid);
        grid.appendChild(section);
    });
}

document.getElementById("confirmPick").onclick = async () => {
    if (!selectedCharacter) return;

    await selectCharacter(currentLobby, playerID, selectedCharacter);

    setTimeout(async () => {
        await confirmAction(currentLobby, playerID);
    }, 300);

    selectedCharacter = null;
    document.getElementById("confirmPick").hidden = true;
};

// Bans and picks each get their own blue/red split: bans render in the
// narrow column sitting between the two team panels (each ban card on
// its own team's side), picks render in their own section below with
// the same left/right split. Both just group the current game's
// team-tagged bans/picks arrays by team.
function renderDraftHistory(draft) {
    const blueBans = document.getElementById("blueBans");
    const redBans = document.getElementById("redBans");
    const bluePicks = document.getElementById("bluePicks");
    const redPicks = document.getElementById("redPicks");

    if (!blueBans || !redBans || !bluePicks || !redPicks) return;

    const cardsFor = (entries, size) => entries.length
        ? entries.map(e => characterCardHTML(e.character, size)).join("")
        : '<span class="historyPlaceholder">—</span>';

    document.getElementById("bansMiddle").hidden = draft.banCount === 0;
    document.getElementById("picksSection").hidden = false;

    blueBans.innerHTML = cardsFor(draft.bans.filter(b => b.team === "Blue"), "sm");
    redBans.innerHTML = cardsFor(draft.bans.filter(b => b.team === "Red"), "sm");
    bluePicks.innerHTML = cardsFor(draft.picks.filter(p => p.team === "Blue"), "md");
    redPicks.innerHTML = cardsFor(draft.picks.filter(p => p.team === "Red"), "md");

    if (matchAnimationsReady && draft.bans.length > lastBansCount) {
        const newest = draft.bans[draft.bans.length - 1];
        const container = newest.team === "Blue" ? blueBans : redBans;
        animateReveal(newest.character, "character", container.lastElementChild, 1);
    }

    if (matchAnimationsReady && draft.picks.length > lastPicksCount) {
        const newest = draft.picks[draft.picks.length - 1];
        const container = newest.team === "Blue" ? bluePicks : redPicks;
        animateReveal(newest.character, "character", container.lastElementChild, 1);
    }

    lastBansCount = draft.bans.length;
    lastPicksCount = draft.picks.length;
}

// ---------------------------------------------------------------------
// Match finished — overall winner, final score, map-by-map summary
// ---------------------------------------------------------------------

function renderMatchFinished(draft) {
    const matchWinner = (draft.scoreBlue ?? 0) > (draft.scoreRed ?? 0) ? "Blue" : "Red";
    const winnerName = teamDisplayName(draft, matchWinner);

    setTurnBanner(matchWinner, `${winnerName} Wins the Match!`, `Final Score ${draft.scoreBlue ?? 0} — ${draft.scoreRed ?? 0}`);

    const summary = document.getElementById("matchSummary");

    summary.hidden = false;

    const history = draft.mapHistory || [];

    summary.innerHTML = `
        <h2>Match Summary</h2>
        <div class="mapHistoryList">
            ${history.map(entry => `
                <div class="mapHistoryRow ${entry.winner ? entry.winner.toLowerCase() + "Side" : ""}">
                    <span class="mapHistoryGame">Game ${entry.gameNumber}</span>
                    <span class="mapHistoryMap">${entry.map}</span>
                    <span class="mapHistoryWinner">${entry.winner ? `${entry.winner === "Blue" ? "🔵" : "🔴"} ${teamDisplayName(draft, entry.winner)} Won` : "—"}</span>
                </div>
            `).join("")}
        </div>
    `;

    summary.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------------------------------------------------------------------
// Leave lobby
// ---------------------------------------------------------------------

document.getElementById("leaveLobby").onclick = async () => {
    if (currentLobby) {
        await deleteDoc(doc(db, "drafts", currentLobby, "players", playerID)).catch(() => {});

        const lobbyRef = doc(db, "drafts", currentLobby);
        const lobbySnap = await getDoc(lobbyRef).catch(() => null);
        const lobby = lobbySnap?.data();

        if (lobby?.blueCaptain === playerID) {
            await updateDoc(lobbyRef, { blueCaptain: null }).catch(() => {});
        }

        if (lobby?.redCaptain === playerID) {
            await updateDoc(lobbyRef, { redCaptain: null }).catch(() => {});
        }
    }

    sessionStorage.removeItem("currentLobby");
    location.reload();
};

// ---------------------------------------------------------------------
// Restore session on page reload (reload must NOT drop you back to the
// name/lobby-code form while a lobby you're still part of is live).
// ---------------------------------------------------------------------

async function tryRestoreSession() {
    const savedLobby = sessionStorage.getItem("currentLobby");

    if (!savedLobby) return;

    const lobbySnap = await getDoc(doc(db, "drafts", savedLobby));

    if (!lobbySnap.exists()) {
        sessionStorage.removeItem("currentLobby");
        return;
    }

    if (isExpired(lobbySnap.data())) {
        await deleteLobbyCompletely(savedLobby);
        sessionStorage.removeItem("currentLobby");
        return;
    }

    const playerSnap = await getDoc(doc(db, "drafts", savedLobby, "players", playerID));

    if (!playerSnap.exists()) {
        sessionStorage.removeItem("currentLobby");
        return;
    }

    playerName = playerSnap.data().name;

    openLobby(savedLobby);
}

tryRestoreSession();
