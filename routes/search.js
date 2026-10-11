// routes/search.js: talks to the OMDb API (mounted at /api/search).
// The browser calls THIS route; only the server ever sees the API key.
const express = require("express");
const { httpError, callOmdb, getMovieDetails } = require("../omdb");

const router = express.Router();

// Common title words. OMDb has no "random movies" endpoint, so for the
// featured list we search one random word from this list.
const FEATURED_KEYWORDS = [
    "love",
    "night",
    "war",
    "life",
    "dark",
    "star",
    "man",
    "world",
    "time",
    "dream",
    "king",
    "city",
    "blood",
    "fire",
    "last",
    "road",
    "dead",
    "summer",
    "home",
    "secret",
    "ghost",
    "island",
    "hero",
    "wild",
    "day",
    "red",
    "black",
];

function sendError(res, status, message) {
    res.status(status).json({ success: false, message });
}

function handleError(res, err) {
    if (err.status) return sendError(res, err.status, err.message);
    console.error(err);
    sendError(res, 500, "Something went wrong while contacting OMDb.");
}

// Converts OMDb's list into simple objects with only the fields the browser needs.
// Used by both the search route and the featured route.
function mapResults(omdbList) {
    return omdbList.map((item) => ({
        imdbID: item.imdbID,
        title: item.Title,
        year: item.Year,
        type: item.Type,
        poster:
        typeof item.Poster === "string" && item.Poster.startsWith("https://")
            ? item.Poster
            : null,
    }));
}

// FEATURED: GET /api/search/featured
// Returns 10 movies for the home page, chosen by searching a random keyword.
router.get("/featured", async (req, res) => {
    try {
        const pool = [...FEATURED_KEYWORDS];

        // Try up to 3 different keywords in case one returns nothing.
        for (let attempt = 0; attempt < 3 && pool.length > 0; attempt++) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            const keyword = pool.splice(randomIndex, 1)[0]; // take it out so it is not reused

            const data = await callOmdb({ s: keyword, type: "movie" });

            if (
                data.Response === "True" &&
                Array.isArray(data.Search) &&
                data.Search.length > 0
            ) {
                // OMDb returns up to 10 results per page, so this is our 10 movies.
                return res.json({
                success: true,
                data: mapResults(data.Search).slice(0, 10),
                });
            }
        }

        throw httpError(
            502,
            "Unable to load featured movies right now. Please try again.",
            );
    } catch (err) {
        handleError(res, err);
    }
});

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

        res.json({ success: true, data: mapResults(data.Search) });
    } catch (err) {
        handleError(res, err);
    }
});

// DETAILS: GET /api/search/details/tt1234567
// Used when the user opens a search result or picks it for the library.
router.get("/details/:imdbId", async (req, res) => {
    if (!/^tt\d{5,10}$/.test(req.params.imdbId)) {
        return sendError(res, 400, "Invalid movie identifier.");
    }

    try {
        const details = await getMovieDetails(req.params.imdbId);
        if (!details) return sendError(res, 404, "Movie details not found.");
        res.json({ success: true, data: details });
    } catch (err) {
        handleError(res, err);
    }
});

module.exports = router;
