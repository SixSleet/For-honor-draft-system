// Map pool for the pre-match map veto (see mapVeto.js) and the
// between-games map picks (draft.js's confirmMapAction).
export const maps = [
    "Citadel Gate",
    "Overwatch",
    "Cathedral",
    "Sanctuary Bridge",
    "Temple Garden",
    "Harbor",
    "High Fort",
    "Beachhead",
    "Canyon",
    "Qiang Pass"
];

// Same "base + drop-in art" system as characters.js's characterImageSrc:
// turns a map name into a slug (e.g. "Qiang Pass" -> "qiang-pass") and
// points at images/maps/<slug>.png. No official art is bundled — drop
// a same-named .png/.jpg in there to replace the placeholder tile.
export function mapSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export function mapImageSrc(name, ext = "png") {
    return `images/maps/${mapSlug(name)}.${ext}`;
}
