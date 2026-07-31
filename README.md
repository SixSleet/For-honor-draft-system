# For Honor Draft Picker

A tool for organizing custom **For Honor** 4v4 matches: team building,
captains, a map veto, a full hero ban/pick draft, and a best-of-N match
with map-by-map results — all synced instantly for everyone in the
lobby.

Just open the page, create or join a lobby with a 6-character code, and
everything updates live for everyone the moment it happens — no
accounts, no sign-up.

## Walkthrough

### 1. Lobby

- **Create Lobby** generates a code and opens the draft room as host.
  **Join Lobby** enters an existing code.
- The lobby code shown at the top is clickable — click it to copy it,
  so you can send it to your friends.
- Everyone who joins starts as a **Spectator** (listed in the top-right
  panel) until they click **+ Join** on the Blue or Red team. Teams cap
  out at 4 players.
- Either team can nominate a **Captain** (**Become Captain**) — the
  captain is the only player on their team who bans, picks, and chooses
  maps. Teammates just fill out the roster and watch. Switching teams
  or leaving gives up captaincy immediately.
- Each captain can rename their own team, and that name is shown
  everywhere for the rest of the match instead of plain "Blue"/"Red".

### 2. Ready up

- Once a team has a captain, that captain gets a **Ready Up** button
  showing live progress, e.g. `Ready Up (1/2)`. Clicking it toggles
  their own team's ready state; their captain badge turns green with a
  "Ready" tag once readied.
- **Start Draft** (host only) can't be used until *both* captains have
  readied up.

### 3. Host Controls

Chosen once, before **Start Draft**, and fixed for the whole match:

| Control | Options | Effect |
|---|---|---|
| Bans per team | No Bans / 1 Ban / 2 Bans | See below |
| Best of | Bo1 / Bo3 / Bo5 | How many games the match needs to be decided |
| First to ban/pick | Blue / Red | Which team acts first in the map veto and every game's draft |

### 4. Map veto (once, before Game 1)

Always in this order:

1. The first team bans a map.
2. The other team bans a map.
3. The other team — the one that banned second — picks Game 1's map
   from whatever's left.

### 5. Character draft (fresh every game)

Each game gets its own ban/pick draft over the full hero roster, grouped
by faction (Knights / Vikings / Samurai / Wu Lin). The active captain
picks a hero and hits **Confirm**; everyone else sees a "waiting on
[team]" banner. A big **BAN** / **PICK** flash announces each new
phase, followed by an animation showing the chosen hero flying into its
slot.

**Ban rules:**

- **No Bans**: both teams just alternate picks until every roster slot
  is filled.
- **1 Ban**: one ban round (first team bans, then the other team bans),
  then every pick, back-to-back — no more banning once picking starts.
- **2 Bans**: two separate ban rounds, each a single ban per team, with
  the picks split evenly between them — ban, pick some, ban again, pick
  the rest.

Whichever team the host set as "first" always acts first in each ban
round and each pick round; the other team always follows.

**Turn timer:** every ban/pick — character or map — has a **2-minute
countdown**, visible to everyone. If it runs out, a random available
character/map is automatically chosen for whoever's turn it was, so one
missing captain can't stall the whole match. The countdown turns red
under 10 seconds.

### 6. Game result

Once a game's draft finishes, the **host** declares which team actually
won that game. This updates the score and either:

- ends the match (a team reached the required win count), showing a big
  victory announcement followed by the final map-by-map summary; or
- hands the **loser** the next map pick (any map not already banned or
  played), which immediately starts that game's fresh character draft.

### Notifications

Any rule messages (e.g. "Character unavailable," "Team full") pop up as
a small message in the bottom-right corner instead of a browser alert,
and the page automatically scrolls you to your selection screen the
instant it becomes your turn.
