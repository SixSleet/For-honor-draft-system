# For Honor Draft Picker

A real-time, multiplayer draft tool for organizing custom **For Honor** 4v4
matches: team building, captains, a map veto, a full hero ban/pick draft,
and a best-of-N match flow with map-by-map results — all synced instantly
across every connected browser, no accounts required.

Live players just open the page, create or join a lobby with a 6-character
code, and everything else (whose turn it is, what's banned, what map is
next) updates for everyone the moment it happens.

## Tech stack

- **Plain HTML/CSS/JS** — ES modules (`<script type="module">`), no
  bundler, no build step, no framework. Open `index.html` (served over
  http/https — see [Running it](#running-it)) and it works.
- **Firebase Firestore** as the only backend: one document per lobby
  (`drafts/{code}`) is the single source of truth, kept in sync across
  clients with `onSnapshot` listeners. There is no server-side code at
  all — every rule about who can act when is enforced client-side (see
  [Security model](#security-model) for what that does and doesn't mean).
- **No authentication.** A player's identity is just a random
  `crypto.randomUUID()` generated on first visit and stored in
  `sessionStorage` — good enough to tell "you" apart from "everyone else
  in this lobby," not a verified login.

## Running it

1. `npm install` (pulls in the `firebase` package used by `firebase.js`).
2. Serve the folder over HTTP — e.g. `npx serve .` or the VS Code "Live
   Server" extension — and open the printed URL. Opening `index.html`
   directly via `file://` will hit ES module / CORS restrictions in most
   browsers, so a local server is required even though there's no build
   step.
3. To point it at your own Firebase project instead of the one already
   configured in `firebase.js`, swap in your own project's config object
   there and publish `firestore.rules` to that project's Firestore
   Rules tab.

## Walkthrough

### 1. Lobby

- **Create Lobby** generates a 6-character code and opens the draft room
  as host. **Join Lobby** enters an existing code.
- The lobby code shown at the top is clickable — click it to copy it to
  the clipboard.
- Everyone who joins starts as a **Spectator** (shown in a fixed
  top-right panel) until they click **+ Join** on the Blue or Red team
  panel. Teams cap out at the configured team size (4 by default).
- Either team can nominate a **Captain** (**Become Captain**) — the
  captain is the only player on their team who ever acts (bans, picks,
  map choices). Teammates just fill out the roster and watch. Switching
  teams or leaving gives up captaincy immediately, so nobody can
  captain one team while sitting on the roster of another.
- Each captain can rename their own team (shown throughout the match
  instead of the plain "Blue"/"Red").

### 2. Ready up

- Once a captain exists for a team, that captain sees a **Ready Up**
  button showing live progress, e.g. `Ready Up (1/2)`. Clicking it
  toggles their own team's ready state; their captain badge glows green
  with a "Ready" tag once readied.
- **Start Draft** (host only) is blocked until *both* captains have
  readied up, and until both teams actually have a captain assigned —
  the rest of the roster can still be filling in.

### 3. Host Controls

Chosen once, before **Start Draft**, and fixed for the whole match:

| Control | Options | Effect |
|---|---|---|
| Bans per team | No Bans / 1 Ban / 2 Bans | See [Draft order](#draft-order--ban-rules) below |
| Best of | Bo1 / Bo3 / Bo5 | How many games the match needs (`⌈bestOf / 2⌉` wins) |
| First to ban/pick | Blue / Red | Which team acts first in the map veto *and* every game's character draft |

### 4. Map veto (once, before Game 1)

A fixed 3-step sequence, always in this order regardless of ban count:

1. The first team bans a map.
2. The other team bans a map.
3. The other team — the one that banned second — picks Game 1's map
   from whatever's left.

### 5. Character draft (fresh every game)

Each game gets its own ban/pick draft over the full hero roster, grouped
by faction (Knights / Vikings / Samurai / Wu Lin). The active captain
picks a hero and hits **Confirm**; everyone else sees a "waiting on
[team]" banner. A big **🚫 BAN** / **⚔ PICK** flash announces each new
phase, and a reveal animation flies the just-chosen hero into its
resting slot before the next phase's flash appears — the two never
overlap.

#### Draft order & ban rules

- **No Bans**: both teams just alternate picks until every roster slot
  is filled.
- **1 Ban**: one ban round (first team bans, then the other team bans),
  *then* every pick, alternating, back-to-back — banning never resumes
  once picking starts.
- **2 Bans**: two separate ban rounds, each a single ban per team, with
  the picks split evenly between them — ban, pick some, ban again, pick
  the rest.

In every case, whichever team the host set as "first" always acts first
in each ban round and each pick round; the other team always follows.

#### Turn timer

Every ban/pick — character or map — has a **2-minute countdown**,
visible to everyone in the turn banner. If it runs out, the active
captain's own client automatically selects a random available
character/map on their behalf, so one AFK captain can't stall the whole
match. The countdown pulses red under 10 seconds.

### 6. Game result

Once a game's draft finishes, the **host** declares which team actually
won that game (based on what happened in-match). This updates the
running score and either:

- ends the whole match (a team hit the required win count for the
  chosen Best of), showing a **🏆 team-colored victory flash** followed
  by the final map-by-map summary; or
- hands the **loser** the next map pick (any map not already banned or
  played), which immediately kicks off that game's fresh character
  draft.

### Notifications

Validation messages ("Character unavailable," "Only your team's captain
can do this," "Team full," etc.) show as small toasts in the
bottom-right corner instead of blocking browser `alert()` dialogs, and
the acting captain is auto-scrolled to their selection grid the instant
it becomes their turn.

## Security model

There's no user authentication, so Firestore Security Rules
(`firestore.rules`) can't verify "this write really came from that
player" — any client can, in principle, act as any player ID it knows.
What the rules *do* enforce:

- A lobby can only be read by its exact 6-character code (`get`) — the
  entire `drafts` collection can't be listed/enumerated, so a lobby's
  code is the only way in.
- Writes must match a minimal schema (right field names/types) for the
  two collections this app actually uses (`drafts/{code}` and its
  `players` subcollection).
- Every other collection is denied outright, so this project's public
  Firebase config can't be repurposed as free, unrestricted storage.

Abandoned lobbies clean themselves up via a Firestore TTL policy on
`expiresAt` (refreshed on activity while a lobby/match is live; a
finished match gets a fixed longer window before it's purged).

## Project structure

| File | Responsibility |
|---|---|
| `index.html` | Page shell — every screen/section the app shows, populated by `app.js` |
| `app.js` | UI layer: renders every screen, wires up all button clicks, drives animations/toasts/timer |
| `firebase.js` | Firebase app + Firestore initialization and re-exported SDK functions |
| `draft.js` | All Firestore reads/writes that mutate match state (create draft, confirm a ban/pick, confirm a map action, declare a game winner) |
| `draftState.js` | Builds the initial match document and the per-game reset shape — the single place the match's data shape is defined |
| `draftOrder.js` | Computes the character draft's ban/pick order for a given ban count and first team |
| `mapVeto.js` | The fixed 3-step map veto order |
| `characters.js` / `maps.js` | Static hero roster (by faction) / map pool, plus image-path helpers |
| `toast.js` | Bottom-right toast notifications (replaces `alert()`) |
| `config.js` | Tunable constants: team size, default ban count/Best of, turn timer length, lobby cleanup windows |
| `firestore.rules` | Firestore Security Rules — see [Security model](#security-model) |
| `style.css` | All styling and animations |
