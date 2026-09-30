// routes/movies.js: CRUD routes for the saved watchlist (mounted at /api/movies).
const express = require("express");
const { readMovies, writeMovies, generateId } = require("../db");

const router = express.Router();

const VALID_STATUSES = ["Planned", "Watching", "Watched"];
const ID_PATTERN = /^[0-9a-f-]{36}$/i; // shape of a UUID

function sendError(res, status, message) {
    res.status(status).json({ success: false, message });
}

// Validates and cleans the request body.
// Returns { error } if something is wrong, or { movie } with clean values.
function validateMovieInput(body) {
    const input = body && typeof body === "object" ? body : {};

    const title = typeof input.title === "string" ? input.title.trim() : "";
    const genre = typeof input.genre === "string" ? input.genre.trim() : "";
    const yearIsUsable =
        typeof input.year === "number" || typeof input.year === "string";
    const year = yearIsUsable ? Number(input.year) : NaN;
    const status =
        input.status === undefined || input.status === ""
        ? "Planned"
        : input.status;
    const rating =
        input.rating === undefined || input.rating === ""
        ? 0
        : Number(input.rating);
    const maxYear = new Date().getFullYear() + 5; // allow upcoming releases

    if (!title) return { error: "Movie title is required." };
    if (title.length > 100)
        return { error: "Title must be 100 characters or fewer." };
    if (!genre) return { error: "Genre is required." };
    if (genre.length > 50)
        return { error: "Genre must be 50 characters or fewer." };
    if (!Number.isInteger(year) || year < 1888 || year > maxYear) {
        return { error: "Please enter a valid year." };
    }
    if (!VALID_STATUSES.includes(status)) {
        return { error: "Status must be Planned, Watching, or Watched." };
    }
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
        return { error: "Rating must be a whole number from 0 to 5." };
    }

    // rating 0 means "not rated yet"
    return { movie: { title, genre, year, status, rating } };
}

// READ ALL: GET /api/movies
router.get("/", async (req, res) => {
    try {
        const movies = await readMovies();
        res.json({ success: true, data: movies });
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
        res.json({ success: true, data: movie });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to load the movie.");
    }
});

// CREATE: POST /api/movies
router.post("/", async (req, res) => {
    const { error, movie } = validateMovieInput(req.body);
    if (error) return sendError(res, 400, error);

    try {
        const movies = await readMovies();
        const newMovie = { id: generateId(), ...movie };
        movies.push(newMovie);
        await writeMovies(movies);
        res.status(201).json({ success: true, data: newMovie });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to save the movie.");
    }
});

// UPDATE: PUT /api/movies/:id
router.put("/:id", async (req, res) => {
    if (!ID_PATTERN.test(req.params.id))
        return sendError(res, 400, "Invalid movie ID.");
    const { error, movie } = validateMovieInput(req.body);
    if (error) return sendError(res, 400, error);

    try {
        const movies = await readMovies();
        const index = movies.findIndex((m) => m.id === req.params.id);
        if (index === -1) return sendError(res, 404, "Movie not found.");

        // Keep the original ID; replace everything else with the validated values.
        movies[index] = { id: movies[index].id, ...movie };
        await writeMovies(movies);
        res.json({ success: true, data: movies[index] });
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
        res.json({ success: true, data: deleted });
    } catch (err) {
        console.error(err);
        sendError(res, 500, "Unable to delete the movie.");
    }
});

module.exports = router;
