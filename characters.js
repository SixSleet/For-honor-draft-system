// Complete For Honor hero roster (39 heroes), grouped by faction in the
// same order as forhonorinfohub.com's own character list — the
// selection grid renders section-by-section in this order so heroes
// are easy to find by faction instead of one giant unsorted grid.
export const charactersByFaction = [
    {
        faction: "Knights",
        heroes: [
            "Warden",
            "Conqueror",
            "Peacekeeper",
            "Lawbringer",
            "Centurion",
            "Gladiator",
            "Black Prior",
            "Warmonger",
            "Gryphon"
        ]
    },
    {
        faction: "Vikings",
        heroes: [
            "Raider",
            "Warlord",
            "Berserker",
            "Valkyrie",
            "Highlander",
            "Shaman",
            "Jormungandr",
            "Varangian Guard"
        ]
    },
    {
        faction: "Samurai",
        heroes: [
            "Kensei",
            "Shugoki",
            "Orochi",
            "Nobushi",
            "Shinobi",
            "Aramusha",
            "Hitokiri",
            "Kyoshin",
            "Sohei",
            "Arakure"
        ]
    },
    {
        faction: "Wu Lin",
        heroes: [
            "Tiandi",
            "Jiang Jun",
            "Nuxia",
            "Shaolin",
            "Zhanhu",
            "Juren"
        ]
    },
    {
        faction: "Outlanders",
        heroes: [
            "Pirate",
            "Medjay",
            "Afeera",
            "Ocelotl",
            "Khatun",
            "Virtuosa"
        ]
    }
];

// Flat list of every hero name, in the same overall order, for any code
// (draft logic, character-count checks) that just needs the full roster
// without caring about factions.
export const characters = charactersByFaction.flatMap(group => group.heroes);

// Turns a hero name into a filesystem/URL-safe slug, e.g. "Black Prior"
// -> "black-prior". Portrait art lives in images/characters/<slug>.png
// (downloaded from forhonorinfohub.com for all 39 heroes above) — drop
// a same-named .png (or .jpg) in there to replace any of them.
export function characterSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export function characterImageSrc(name, ext = "png") {
    return `images/characters/${characterSlug(name)}.${ext}`;
}
