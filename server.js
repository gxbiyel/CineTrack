// server.js: starts Express, wires up routes, and handles unexpected errors.
require("dotenv").config(); // loads OMDB_API_KEY from .env into process.env

const express = require("express");
const path = require("path");
const { initDb } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies (limit size so nobody can send huge payloads).
app.use(express.json({ limit: "10kb" }));

// Serve the frontend files in /public (index.html, edit.html, css, js).
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api/movies", require("./routes/movies"));
app.use("/api/search", require("./routes/search"));

// Any other /api/... URL: return JSON 404 instead of an HTML page.
app.use("/api", (req, res) => {
    res.status(404).json({ success: false, message: "API endpoint not found." });
});

// Last-resort error handler. Never sends stack traces to the browser.
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res
        .status(400)
        .json({ success: false, message: "Malformed JSON in request body." });
    }
    console.error(err); // details stay in the server console only
    res.status(500).json({ success: false, message: "Internal server error." });
});

// Make sure data/movies.json exists, then start listening.
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`CineTrack running at http://localhost:${PORT}`);
            if (!process.env.OMDB_API_KEY) {
                console.warn(
                "Warning: OMDB_API_KEY is not set. Movie search will be unavailable.",
                );
            }
        });
    })
    .catch((err) => {
        console.error("Could not initialize the data file:", err.message);
        process.exit(1);
    });
