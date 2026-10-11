// omdb.js: the one place that talks to the OMDb API. Used by the search routes AND by the
// movies routes (which re-fetch a movie from OMDb on the server before saving it as
// "API-sourced", so the browser can never make up data and label it as coming from OMDb).
const { normalizeReleaseDate } = require("./dates");

const OMDB_URL = "https://www.omdbapi.com/";

// Small helper to create an error that carries an HTTP status code.
function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Sends one request to OMDb and returns the parsed JSON.
// Throws an httpError with a user-friendly message if anything goes wrong.
async function callOmdb(params) {
    const apiKey = process.env.OMDB_API_KEY;
    if (!apiKey || apiKey === "YOUR_KEY_HERE") {
        throw httpError(
            500,
            "Movie search is currently unavailable because the server API key is not configured.",
        );
    }

    // URLSearchParams safely encodes the user's text (e.g. spaces, symbols).
    const url = new URL(OMDB_URL);
    url.searchParams.set("apikey", apiKey);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    let response;
    try {
        response = await fetch(url, { signal: AbortSignal.timeout(8000) }); // 8 s timeout
    } catch (err) {
        console.error("OMDb request failed:", err.message); // do not log the URL (it has the key)
        throw httpError(502, "Unable to contact OMDb right now. Please try again.");
    }

    let data;
    try {
        data = await response.json(); // fails if OMDb sent something that is not JSON
    } catch {
        throw httpError(502, "OMDb sent an unexpected response. Please try again.");
    }

    if (!data || typeof data !== "object" || typeof data.Response !== "string") {
        throw httpError(502, "OMDb sent an unexpected response. Please try again.");
    }

    // OMDb reports a bad key as { Response: "False", Error: "Invalid API key!" }
    if (data.Response === "False" && /api key/i.test(data.Error || "")) {
        throw httpError(
            500,
            "Movie search is currently unavailable because the server API key is not valid.",
        );
    }

    return data;
}

// Turns OMDb's raw answer into CineTrack's shape. Shared by every lookup below, so the
// "API's values" are always computed the same way.
function mapDetails(data) {
    // OMDb uses "N/A" for missing values; turn that into "".
    const text = (value) =>
        typeof value === "string" && value !== "N/A" ? value : "";

    // OMDb genres look like "Action, Crime, Drama"; keep the first one.
    const firstGenre = text(data.Genre).split(",")[0].trim();

    // OMDb lists many actors; "Main cast" is the first three.
    const mainCast = text(data.Actors)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");

    return {
        imdbID: /^tt\d{5,10}$/.test(data.imdbID || "") ? data.imdbID : "",
        title: text(data.Title),
        year: parseInt(data.Year, 10) || null,
        genre: firstGenre,
        // "18 Jul 2008" -> "2008-07-18"; "" when OMDb has no (valid) date.
        released: normalizeReleaseDate(text(data.Released)) || "",
        director: text(data.Director),
        plot: text(data.Plot),
        actors: mainCast,
        poster: text(data.Poster).startsWith("https://") ? data.Poster : "",
    };
}

// Looks up one movie by IMDb id and returns it in CineTrack's shape, or null if OMDb does not
// know it. This is the single source of truth for what "the API's values" are.
async function getMovieDetails(imdbId) {
    const data = await callOmdb({ i: imdbId, plot: "full" });
    return data.Response === "False" ? null : mapDetails(data);
}

// Looks a movie up by title (and year when known). Only used to verify older saved movies.
async function findMovieByTitle(title, year) {
    const params = { t: title, plot: "full" };
    if (Number(year)) params.y = String(Number(year));
    const data = await callOmdb(params);
    return data.Response === "False" ? null : mapDetails(data);
}

// What gets saved for an API-sourced movie (same size limits the routes use for typed details).
function toStoredDetails(details) {
    const released = details.released;
    return {
        title: details.title.slice(0, 100),
        genre: details.genre.slice(0, 50), // may be "" when OMDb has no genre
        year: released ? Number(released.slice(0, 4)) : details.year,
        released,
        poster: details.poster.slice(0, 500),
        plot: details.plot.slice(0, 2000),
        director: details.director.slice(0, 200),
        actors: details.actors.slice(0, 300),
    };
}

module.exports = {
    httpError,
    callOmdb,
    getMovieDetails,
    findMovieByTitle,
    toStoredDetails,
};
