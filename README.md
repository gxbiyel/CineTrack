# 🎬 CineTrack

**A Movie Watchlist Management System with OMDb API Integration**

CineTrack is a personal movie tracking application. Save the movies you plan to watch, are currently watching, or have already watched; discover new titles through the [OMDb API](https://www.omdbapi.com/); and keep your own ratings and reviews in one place. Movies that OMDb doesn't have can be added manually.

It is built with **Node.js + Express** on the backend and **vanilla HTML, CSS, and JavaScript** on the frontend. Records are stored in a local JSON file, so no database server is needed.

> **Academic project** – Final Project in *Integrative Programming*, BS Information Technology, National University – Clark, 1st Term A.Y. 2026–2027.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [How it works: OMDb vs. manual movies](#how-it-works-omdb-vs-manual-movies)
- [Rules and validation](#rules-and-validation)
- [Database schema](#database-schema)
- [REST API](#rest-api)
- [User interface](#user-interface)
- [Project structure](#project-structure)
- [Security notes](#security-notes)
- [Limitations and future work](#limitations-and-future-work)
- [Team](#team)

---

## Features

**Add a Movie**
- Add by **manual entry** (title, genre, release date, director, main cast, plot, poster link, status, rating, review) or by picking a movie from **Discover**, which auto-fills the form from OMDb.
- A **Clear form** button resets an OMDb-filled form so you can enter a movie by hand instead.
- Assign a viewing status: `Planned`, `Watching`, or `Watched`.
- Rating (0–5 stars) and review are available only when the status is `Watched`.

**Discover Movies**
- Shows an initial selection of **10 movies** drawn from a random keyword search when the page loads.
- **Search by title** (live search after 3 characters, or press Enter).
- Open a **details popup** with poster, release date, genre, director, plot, and the first three cast members, then use **Add to library** to send the details to the Add form.

**Movie Library**
- Movie cards with poster, status badge, title, genre, release date, star rating, and a review snippet.
- **Search** by title or genre, **filter** by status (All / Planned / Watching / Watched), and a counter showing visible vs. total movies.
- **Details popup** in Library mode, with an **Edit review** option for Watched movies and an **Edit details** link.
- **Edit** and **Delete** on every card, with a confirmation prompt before deleting.
- Friendly empty-state messages for an empty library and for filters with no matches.

**Data integrity**
- Details that came from OMDb are **read-only**; manually added movies stay fully editable. This is enforced on the server too, not just in the UI.

---

## Tech stack

| Component        | Technology                                   |
| ---------------- | -------------------------------------------- |
| Frontend         | HTML5, CSS3, JavaScript (no framework)       |
| Backend          | Node.js (v18+), Express.js 4, dotenv         |
| Data storage     | JSON file (`data/movies.json`)               |
| External API     | [OMDb API](https://www.omdbapi.com/)         |
| Development tools| Visual Studio Code, Git, GitHub              |

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) **18 or newer** (the server relies on the built-in `fetch`)
- A free OMDb API key: <https://www.omdbapi.com/apikey.aspx>

### Installation

```bash
# 1. Get the code
git clone https://github.com/gxbiyel/CineTrack.git
cd CineTrack

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env
```

Edit `.env` and add your own key:

```env
OMDB_API_KEY=your_key_here
PORT=3000
```

`PORT` is optional and defaults to `3000`.

### Run

```bash
npm start
```

Then open **<http://localhost:3000>**.

If `OMDB_API_KEY` is missing, the server prints a warning and still starts. OMDb search and details are unavailable until a valid key is set, but manual movies keep working.

---

## How it works: OMDb vs. manual movies

Every saved movie has a `source`, decided **only by the server** (the browser cannot set it).

| Source   | How it is created                                                            | What can be edited                                                            |
| -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `omdb`   | Chosen from Discover. The server re-fetches the details from OMDb itself.    | Only **status, rating, and review**. OMDb metadata is locked.                 |
| `manual` | Typed in through the Add form.                                               | **Everything**: title, genre, release date, director, cast, plot, poster.     |

This guarantees that "from OMDb" always means real OMDb data.

**Older records:** on startup, any saved movie without a source is checked once against OMDb. It is marked `omdb` only if OMDb's own record matches what was saved (the plot or poster, plus at least one more detail). Otherwise it is marked `manual` and stays editable. If OMDb can't be reached, nothing changes and the check runs again on the next start.

---

## Rules and validation

- **Rating and review** are enabled only when the status is `Watched`. Ratings are whole numbers from 0 (not rated) to 5. The interface enforces the Watched-only rule; the server validates the value ranges.
- **Release dates** are stored as `YYYY-MM-DD`. OMDb-style dates such as `18 Jul 2008` are accepted and converted. A missing date is allowed; an impossible one (like `2023-02-31`) is rejected.
- **Manual movies** require a title (max 100 characters), a genre (max 50), and a release date or year between 1888 and five years from now.
- **Size limits:** plot 2000 characters, review 1000, director 200, cast 300, poster URL 500 (must be `http` or `https`). JSON request bodies are capped at 10 KB.
- **IDs:** movie IDs must be valid UUIDs and IMDb IDs must look like `tt1234567`, otherwise the API returns `400`.

---

## Database schema

Movies are stored in `data/movies.json` as an array of objects, one per movie. The file is created automatically on first run.

| Field      | Type          | Description                                                      |
| ---------- | ------------- | ---------------------------------------------------------------- |
| `id`       | String (UUID) | Unique movie identifier                                          |
| `source`   | String        | `omdb` or `manual`                                               |
| `imdbID`   | String        | IMDb identifier (OMDb movies only)                               |
| `title`    | String        | Movie title                                                      |
| `genre`    | String        | Movie genre (first genre only for OMDb movies)                   |
| `year`     | Integer       | Release year                                                     |
| `released` | String        | Release date, `YYYY-MM-DD` (may be empty)                        |
| `director` | String        | Movie director                                                   |
| `actors`   | String        | Selected cast members (first three for OMDb movies)              |
| `plot`     | String        | Movie synopsis                                                   |
| `poster`   | String (URL)  | Poster link (stored as a URL, not a local image)                 |
| `status`   | String        | `Planned`, `Watching`, or `Watched`                              |
| `rating`   | Integer       | Personal rating, 0–5 (0 = not rated)                             |
| `review`   | String        | Personal review                                                  |

Example record:

```json
{
  "id": "3f2b8c1e-5a47-4d6e-9b1a-7c0d2e4f8a12",
  "source": "omdb",
  "imdbID": "tt0468569",
  "title": "The Dark Knight",
  "genre": "Action",
  "year": 2008,
  "released": "2008-07-18",
  "director": "Christopher Nolan",
  "actors": "Christian Bale, Heath Ledger, Aaron Eckhart",
  "plot": "When the menace known as the Joker wreaks havoc on Gotham...",
  "poster": "https://example.com/poster.jpg",
  "status": "Watched",
  "rating": 5,
  "review": "Still the best superhero film."
}
```

Writes go to a temporary file first and are then renamed into place, so a crash mid-save can't corrupt the library. To back up or move your library, copy `data/movies.json`.

---

## REST API

All responses use `{ "success": true, "data": ... }` on success, or `{ "success": false, "message": "..." }` on failure. Unknown `/api/...` paths return `404` with "API endpoint not found."

### Saved movies

| Method   | Path              | Purpose                                                                           |
| -------- | ----------------- | --------------------------------------------------------------------------------- |
| `GET`    | `/api/movies`     | List all saved movies                                                             |
| `GET`    | `/api/movies/:id` | Get one movie (used by the edit page)                                             |
| `POST`   | `/api/movies`     | Add a movie. Send `imdbID` for an OMDb movie, or full details for a manual one.   |
| `PUT`    | `/api/movies/:id` | Update a movie. OMDb movies accept only `status`, `rating`, `review`.             |
| `DELETE` | `/api/movies/:id` | Delete a movie                                                                    |

### OMDb search

| Method | Path                            | Purpose                                           |
| ------ | ------------------------------- | ------------------------------------------------- |
| `GET`  | `/api/search?title=`            | Search OMDb by title                              |
| `GET`  | `/api/search/featured`          | 10 movies from a random keyword search            |
| `GET`  | `/api/search/details/:imdbId`   | Full details for one OMDb movie                   |

### Status codes

| Code  | Meaning                                                                    |
| ----- | -------------------------------------------------------------------------- |
| `200` | Success (also used for a search with no results, with an empty list)       |
| `201` | Movie created                                                              |
| `400` | Invalid input, invalid ID, or malformed JSON                               |
| `404` | Movie or endpoint not found                                                |
| `500` | Server error, or the OMDb API key is missing or invalid                    |
| `502` | OMDb unreachable or returned an unexpected response (8-second timeout)     |

### Examples

Add an OMDb movie (the server fetches the details itself):

```bash
curl -X POST http://localhost:3000/api/movies \
  -H "Content-Type: application/json" \
  -d '{"imdbID": "tt0468569", "status": "Planned"}'
```

Add a manual movie:

```bash
curl -X POST http://localhost:3000/api/movies \
  -H "Content-Type: application/json" \
  -d '{"title": "My Home Video", "genre": "Documentary", "released": "2024-05-01", "status": "Watched", "rating": 5}'
```

---

## User interface

The app has a dark theme with red accents, a poster-focused layout, and notification banners for success and error messages. It has two pages:

- **`index.html` (main page)** – header with navigation to three sections: *Add a Movie*, *Discover Movies*, and *Movie Library*. A shared details popup is used by both Discover and the Library.
- **`edit.html` (edit page)** – a form pre-filled with the selected movie. OMDb movies show a note explaining that their details are locked; manual movies are fully editable. Saving returns you to the library.

<!-- Optional: add screenshots here, e.g.
![Main page](docs/screenshots/main-page.png)
![Discover](docs/screenshots/discover.png)
![Movie library](docs/screenshots/library.png)
-->

---

## Project structure

```
CineTrack/
├── server.js          # Entry point: middleware, routes, error handling
├── db.js              # Reads/writes data/movies.json (atomic writes, UUIDs)
├── omdb.js            # All requests to the OMDb API
├── dates.js           # Release-date normalization and validation
├── legacy.js          # Startup check that assigns a source to older records
├── routes/
│   ├── movies.js      # CRUD for /api/movies
│   └── search.js      # Search, featured, and details for /api/search
├── public/
│   ├── index.html     # Main page (add, discover, library)
│   ├── edit.html      # Edit page
│   ├── app.js         # Main page logic (discovery and library)
│   ├── edit.js        # Edit page logic
│   ├── common.js      # Shared helpers and client-side validation
│   └── style.css      # Layout and styling
├── data/
│   └── movies.json    # Saved movie records
├── .env.example       # Template for environment variables
└── package.json       # Metadata, dependencies, scripts
```

---

## Security notes

- The OMDb key lives in `.env` (git-ignored) and is read only by the server. It is never sent to the browser or written to logs.
- **Never commit, screenshot, or paste your real API key** into documents, issues, or chat. If a key is ever exposed, request a new one from OMDb.
- Error responses never include stack traces; details stay in the server console.
- Movie IDs, IMDb IDs, and request bodies are validated on every route.

---

## Limitations and future work

- File-based storage limits scalability, concurrent updates, and multi-user access. A future version could move to a database management system.
- There are no user accounts; the app is designed for personal, single-user use.
- OMDb's free tier has a daily request limit.
- The featured list comes from a random keyword search, because OMDb has no "random" or "recent releases" endpoint.
- Discover searches by movie title only.

---

## Team

Final project in **Integrative Programming**, BS Information Technology, **National University – Clark**.
Instructor: **Mr. Adrian Lee G. Magcalas, MSIT** · Submitted: October 2026

| Member                          | Contribution                          |
| ------------------------------- | ------------------------------------- |
| Cabral, Bea Mei P.              | Documentation                         |
| David, Nigel James L.           | Documentation                         |
| Serrano, Bianca Gabrielle R.    | Project Lead, Backend Development     |
| Soriano, Den Mark C.            | Frontend Development, Documentation   |

---

## Credits

Movie data provided by the [OMDb API](https://www.omdbapi.com/).