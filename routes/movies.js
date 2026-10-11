// routes/movies.js: CRUD routes for the saved watchlist (mounted at /api/movies).
//
// Every movie has a source, decided ONLY by the server (the browser cannot set it):
//   "omdb"   - created from an OMDb lookup. The server fetches the details from OMDb itself
//              and stores them. Afterwards only status, rating and review can change.
//   "manual" - typed in by the user. Every field stays editable.
// Movies saved before sources existed have no source and are treated as "manual".
const express = require("express");
const { readMovies, writeMovies, generateId } = require("../db");
const { normalizeReleaseDate } = require("../dates");
const { getMovieDetails, toStoredDetails } = require("../omdb");

const router = express.Router();

const VALID_STATUSES = ["Planned", "Watching", "Watched"];
const ID_PATTERN = /^[0-9a-f-]{36}$/i; // shape of a UUID
const IMDB_PATTERN = /^tt\d{5,10}$/; // shape of an IMDb id

// A movie counts as API-sourced if it says so OR carries an IMDb id (only OMDb movies have one).
const sourceOf = (movie) =>
    movie && (movie.source === "omdb" || IMDB_PATTERN.test(movie.imdbID || ""))
        ? "omdb"
        : "manual";
const withSource = (movie) => ({ ...movie, source: sourceOf(movie) });

function sendError(res, status, message) {
    res.status(status).json({ success: false, message });
}

function optionalText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
function isWebUrl(value) {
    try {
        const { protocol } = new URL(value);
        return protocol === "https:" || protocol === "http:";
    } catch {
        return false;
    }
}

// Validates the details of a MANUAL movie: title, genre, release date, director, cast, plot, poster.
// Returns { error } if something is wrong, or { meta } with clean values.
function validateMetadata(input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const genre = typeof input.genre === "string" ? input.genre.trim() : "";
    // Release date ("YYYY-MM-DD" or older "18 Jul 2008"). Optional: some movies have no
    // known date. When there is one, the year is taken from it so the two never disagree.
    const released = normalizeReleaseDate(input.released);
    if (released === null) return { error: "Please enter a valid release date." };
    const yearIsUsable =
        typeof input.year === "number" || typeof input.year === "string";
    const year = released
        ? Number(released.slice(0, 4))
        : yearIsUsable
          ? Number(input.year)
          : NaN;
    const maxYear = new Date().getFullYear() + 5; // allow upcoming releases
    const poster = optionalText(input.poster, 500);
    if (poster && !isWebUrl(poster))
        return { error: "Invalid poster URL." };

    if (!title) return { error: "Movie title is required." };
    if (title.length > 100)
        return { error: "Title must be 100 characters or fewer." };
    if (!genre) return { error: "Genre is required." };
    if (genre.length > 50)
        return { error: "Genre must be 50 characters or fewer." };
    if (!Number.isInteger(year) || year < 1888 || year > maxYear) {
        return {
            error: year
                ? "Please enter a valid release date."
                : "Release date is required.",
        };
    }

    return {
        meta: {
            title,
            genre,
            year,
            released,
            poster,
            plot: optionalText(input.plot, 2000),
            director: optionalText(input.director, 200),
            actors: optionalText(input.actors, 300),
        },
    };
}

// Validates the user's own fields (allowed for every movie): status, rating, review.
function validateUserFields(input) {
    const status =
        input.status === undefined || input.status === ""
            ? "Planned"
            : input.status;
    const rating =
        input.rating === undefined || input.rating === ""
            ? 0
            : Number(input.rating);

    if (!VALID_STATUSES.includes(status)) {
        return { error: "Status must be Planned, Watching, or Watched." };
    }
    // rating 0 means "not rated yet"
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
        return { error: "Rating must be a whole number from 0 to 5." };
    }
    return { fields: { status, rating, review: optionalText(input.review, 1000) } };
}

// READ ALL: GET /api/movies
router.get("/", async (req, res) => {
    try {
        const movies = await readMovies();
        res.json({ success: true, data: movies.map(withSource) });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to load the movie list.");
    }
});

// READ ONE: GET /api/movies/:id (used by the edit page)
router.get("/:id", async (req, res) => {
    if (!ID_PATTERN.test(req.params.id))
        return sendError(res, 400, "Invalid movie ID.");
    try {
        const movies = await readMovies();
        const movie = movies.find((m) => m.id === req.params.id);
        if (!movie) return sendError(res, 404, "Movie not found.");
        res.json({ success: true, data: withSource(movie) });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to load the movie.");
    }
});

// CREATE: POST /api/movies
//   With an "imdbID": an API-sourced movie. The details in the request are ignored; the
//   server fetches them from OMDb itself, so "omdb" always means real OMDb data.
//   Without one: a manual movie, validated as before.
router.post("/", async (req, res) => {
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const imdbId = typeof input.imdbID === "string" ? input.imdbID.trim() : "";

    let manual = null;
    if (imdbId) {
        if (!IMDB_PATTERN.test(imdbId))
            return sendError(res, 400, "Invalid movie identifier.");
    } else {
        manual = validateMetadata(input);
        if (manual.error) return sendError(res, 400, manual.error);
    }
    const user = validateUserFields(input);
    if (user.error) return sendError(res, 400, user.error);

    try {
        let newMovie;
        if (imdbId) {
            const details = await getMovieDetails(imdbId);
            if (!details || !details.title)
                return sendError(res, 404, "Movie details not found.");
            newMovie = {
                id: generateId(),
                source: "omdb",
                imdbID: imdbId,
                ...toStoredDetails(details),
                ...user.fields,
            };
        } else {
            newMovie = {
                id: generateId(),
                source: "manual",
                ...manual.meta,
                ...user.fields,
            };
        }
        const movies = await readMovies();
        movies.push(newMovie);
        await writeMovies(movies);
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        if (err.status) return sendError(res, err.status, err.message); // OMDb problems
        console.error(err);
        sendError(res, 500, "Unable to save the movie.");
    }
});

// UPDATE: PUT /api/movies/:id
router.put("/:id", async (req, res) => {
    if (!ID_PATTERN.test(req.params.id))
        return sendError(res, 400, "Invalid movie ID.");
    const input = req.body && typeof req.body === "object" ? req.body : {};

    try {
        const movies = await readMovies();
        const index = movies.findIndex((m) => m.id === req.params.id);
        if (index === -1) return sendError(res, 404, "Movie not found.");
        const existing = movies[index];

        const user = validateUserFields(input);

        if (sourceOf(existing) === "omdb") {
            // API-sourced: the stored OMDb details are locked. Anything the request says about
            // title, genre, date, director, cast, plot, poster, source or imdbID is ignored.
            if (user.error) return sendError(res, 400, user.error);
            movies[index] = { ...existing, source: "omdb", ...user.fields };
        } else {
            const manual = validateMetadata(input);
            if (manual.error) return sendError(res, 400, manual.error);
            if (user.error) return sendError(res, 400, user.error);
            // Keep the original ID and source (a request can never change them).
            movies[index] = {
                id: existing.id,
                source: "manual",
                ...manual.meta,
                ...user.fields,
            };
        }
        await writeMovies(movies);
        res.json({ success: true, data: withSource(movies[index]) });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to update the movie.");
    }
});

// DELETE: DELETE /api/movies/:id
router.delete("/:id", async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) 
        return sendError(res, 400, "Invalid movie ID.");

    try {
        const movies = await readMovies();
        const index = movies.findIndex((m) => m.id === req.params.id);
        if (index === -1) return sendError(res, 404, "Movie not found.");

        const [deleted] = movies.splice(index, 1); // remove it from the array
        await writeMovies(movies);
        res.json({ success: true, data: withSource(deleted) });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to delete the movie.");
    }
});

module.exports = router;
