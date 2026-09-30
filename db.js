// db.js: the "database layer". All reading/writing of data/movies.json happens here.
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "movies.json");

// Create data/movies.json containing an empty array if it does not exist yet.
async function initDb() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, "[]", "utf8");
    }
}

// Read every movie from the file. Throws if the file is unreadable or corrupted.
async function readMovies() {
    const text = await fs.readFile(DATA_FILE, "utf8");
    if (text.trim() === "") return [];
    const movies = JSON.parse(text);
    if (!Array.isArray(movies)) {
        throw new Error("movies.json must contain an array");
    }
    return movies;
}

// Write the full list back to disk.
// We write to a temporary file first and then rename it, so a crash in the
// middle of writing cannot leave movies.json half-written (corrupted).
async function writeMovies(movies) {
    const tempFile = DATA_FILE + ".tmp";
    await fs.writeFile(tempFile, JSON.stringify(movies, null, 2), "utf8");
    await fs.rename(tempFile, DATA_FILE);
}

// Unique, stable ID for each movie (never reused, never changes on edit).
function generateId() {
    return crypto.randomUUID();
}

module.exports = { initDb, readMovies, writeMovies, generateId };
