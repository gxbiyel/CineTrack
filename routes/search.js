// routes/search.js: talks to the OMDb API (mounted at /api/search).
// The browser calls THIS route; only the server ever sees the API key.
const express = require("express");

const router = express.Router();
const OMDB_URL = "https://www.omdbapi.com/";

function sendError(res, status, message) {
    res.status(status).json({ success: false, message });
}

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

function handleError(res, err) {
    if (err.status) return sendError(res, err.status, err.message);
    console.error(err);
    sendError(res, 500, "Something went wrong while contacting OMDb.");
}

// SEARCH: GET /api/search?title=batman
router.get("/", async (req, res) => {
    const title =
        typeof req.query.title === "string" ? req.query.title.trim() : "";
    if (!title)
        return sendError(res, 400, "Please enter a movie title to search.");
    if (title.length > 100)
        return sendError(res, 400, "Search text is too long.");

    try {
        const data = await callOmdb({ s: title });

        // No matches is not a server error, so reply with success and an empty list.
        if (data.Response === "False") {
        if (/too many/i.test(data.Error || "")) {
            return res.json({
            success: true,
            message: "Too many results. Please enter a more specific title.",
            data: [],
            });
        }
        if (/not found/i.test(data.Error || "")) {
            return res.json({
            success: true,
            message: "No movies found for your search.",
            data: [],
            });
        }
        throw httpError(
            502,
            "Unable to contact OMDb right now. Please try again.",
        );
        }

        if (!Array.isArray(data.Search)) {
            throw httpError(
                502,
                "OMDb sent an unexpected response. Please try again.",
            );
        }

        // Send the browser only the fields it needs, with simple names.
        const results = data.Search.map((item) => ({
        imdbID: item.imdbID,
        title: item.Title,
        year: item.Year,
        type: item.Type,
        poster:
            typeof item.Poster === "string" && item.Poster.startsWith("https://")
            ? item.Poster
            : null,
        }));

        res.json({ success: true, data: results });
    } catch (err) {
        handleError(res, err);
    }
});

// DETAILS: GET /api/search/details/tt1234567
// Used to fetch the genre when the user picks a search result.
router.get("/details/:imdbId", async (req, res) => {
    if (!/^tt\d{5,10}$/.test(req.params.imdbId)) {
        return sendError(res, 400, "Invalid movie identifier.");
    }

    try {
        const data = await callOmdb({ i: req.params.imdbId });
        if (data.Response === "False")
        return sendError(res, 404, "Movie details not found.");

        // OMDb genres look like "Action, Crime, Drama"; keep the first one.
        const firstGenre =
        typeof data.Genre === "string" && data.Genre !== "N/A"
            ? data.Genre.split(",")[0].trim()
            : "";

        res.json({
        success: true,
        data: {
            title: data.Title,
            year: parseInt(data.Year, 10) || null,
            genre: firstGenre,
        },
        });
    } catch (err) {
        handleError(res, err);
    }
});

module.exports = router;
