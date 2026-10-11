// legacy.js: gives older saved movies a source.
//
// Movies saved before CineTrack tracked sources have no "source" field, so nothing says whether
// they came from OMDb. On startup we check each of them once against OMDb itself:
//   - it is only called "omdb" when OMDb's own record for that title/year matches what is saved
//     (the long plot text or the poster link has to match, plus at least one more detail), so a
//     movie someone typed in by hand is not locked by accident;
//   - verified movies are marked "omdb", get their IMDb id, and get OMDb's original values back;
//   - everything else is marked "manual" and stays fully editable;
//   - if OMDb cannot be reached, nothing is changed and the check simply runs again next start.
const { readMovies, writeMovies } = require("./db");
const { normalizeReleaseDate } = require("./dates");
const { findMovieByTitle, toStoredDetails } = require("./omdb");

const DETAIL_FIELDS = ["poster", "plot", "released", "director", "actors"];

const same = (a, b) =>
    !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const castOf = (value) =>
    String(value || "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .join(", ");

// Is this saved movie really a copy of OMDb's record?
function matchesOmdb(movie, api) {
    if (!api || !api.imdbID || !same(movie.title, api.title)) return false;
    if (api.year && Number(movie.year) && api.year !== Number(movie.year)) return false;

    const hit = {
        poster: same(movie.poster, api.poster),
        plot: same(movie.plot, api.plot),
        released: !!api.released && normalizeReleaseDate(movie.released) === api.released,
        director: same(movie.director, api.director),
        actors: same(castOf(movie.actors), api.actors),
    };
    const total = Object.values(hit).filter(Boolean).length;
    return (hit.plot || hit.poster) && total >= 2;
}

async function backfillSources() {
    const pending = (await readMovies()).filter((m) => !m.source && !m.imdbID);
    if (pending.length === 0) return;

    const verdicts = new Map(); // movie id -> { source, api? }
    for (const movie of pending) {
        // A movie with only a title, genre and year has nothing to verify: it was typed by hand.
        if (!DETAIL_FIELDS.some((field) => movie[field])) {
            verdicts.set(movie.id, { source: "manual" });
            continue;
        }
        let api;
        try {
            api = await findMovieByTitle(movie.title, movie.year);
        } catch (err) {
            // OMDb unreachable (or no API key): leave the rest alone and try again next start.
            console.warn(
                `Could not check older movies against OMDb (${err.message}). They stay editable until the next start.`,
            );
            break;
        }
        verdicts.set(
            movie.id,
            matchesOmdb(movie, api) ? { source: "omdb", api } : { source: "manual" },
        );
    }
    if (verdicts.size === 0) return;

    // Read again before saving so changes made while we waited for OMDb are not overwritten.
    let tagged = 0;
    const movies = (await readMovies()).map((movie) => {
        const verdict = !movie.source && !movie.imdbID && verdicts.get(movie.id);
        if (!verdict) return movie;
        const { id, ...rest } = movie;
        if (verdict.source === "manual") return { id, source: "manual", ...rest };
        tagged++;
        // status, rating and review are the user's own and are kept; the details go back to OMDb's.
        return {
            id,
            source: "omdb",
            imdbID: verdict.api.imdbID,
            ...rest,
            ...toStoredDetails(verdict.api),
        };
    });
    await writeMovies(movies);
    console.log(
        `Checked ${verdicts.size} older movie(s) against OMDb: ${tagged} marked as OMDb movies, the rest as manual.`,
    );
}

module.exports = { backfillSources, matchesOmdb };
