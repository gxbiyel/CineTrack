// app.js: logic for the main page (list, add, delete, filter, OMDb search).
const MOVIES_URL = "/api/movies";

let allMovies = []; // copy of the saved movies currently shown

// ---- Page elements ----
const messageBox = document.getElementById("message");
const movieForm = document.getElementById("movie-form");
const titleInput = document.getElementById("title");
const genreInput = document.getElementById("genre");
const yearInput = document.getElementById("year");
const statusSelect = document.getElementById("status");
const ratingSelect = document.getElementById("rating");
const movieList = document.getElementById("movie-list");
const movieCount = document.getElementById("movie-count");
const emptyState = document.getElementById("empty-state");
const filterText = document.getElementById("filter-text");
const filterStatus = document.getElementById("filter-status");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");

// ---- Helpers ----
let messageTimer;
function showMessage(text, type = "success") {
    messageBox.textContent = text;
    messageBox.className = "message " + type;
    messageBox.hidden = false;

    // Start fade in
    requestAnimationFrame(() => {
        messageBox.classList.add("show");
    });

    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
        messageBox.classList.remove("show");

        // Wait for fade-out animation before hiding
        setTimeout(() => {
            messageBox.hidden = true;
        }, 300);
    }, 5000);
}

// Sends a request and returns the parsed JSON.
// Throws an Error with a readable message if anything fails.
async function apiRequest(url, options) {
    let response;
    try {
        response = await fetch(url, options);
    } catch {
        throw new Error("Cannot reach the server. Is it running?");
    }
    let body;
    try {
        body = await response.json();
    } catch {
        throw new Error("The server sent an invalid response.");
    }
    if (!response.ok || !body.success) {
        throw new Error(body.message || "Something went wrong.");
    }
    return body;
}

// Creates an element with optional CSS class and text (textContent is XSS-safe).
function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function starsText(rating) {
    return rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) : "Not rated";
}

// ---- READ: load and display saved movies ----
async function loadMovies() {
    try {
        const body = await apiRequest(MOVIES_URL);
        allMovies = body.data;
        renderMovies();
    } catch (err) {
        showMessage(err.message, "error");
    }
}

// Draw the movie cards, applying the filter box and status dropdown.
function renderMovies() {
    const text = filterText.value.trim().toLowerCase();
    const status = filterStatus.value;

    const visible = allMovies.filter((movie) => {
        const matchesText =
        movie.title.toLowerCase().includes(text) ||
        movie.genre.toLowerCase().includes(text);
        const matchesStatus =
        status === "All" || (movie.status || "Planned") === status;
        return matchesText && matchesStatus;
    });

    movieList.innerHTML = "";
    movieCount.textContent = `(${visible.length} of ${allMovies.length})`;

    if (allMovies.length === 0) {
        emptyState.textContent =
        "Your watchlist is empty. Add your first movie above!";
    } else if (visible.length === 0) {
        emptyState.textContent = "No saved movies match your filter.";
    }
    emptyState.hidden = visible.length > 0;

    visible.forEach((movie) => movieList.appendChild(createMovieCard(movie)));
}

function createMovieCard(movie) {
    // Older records may only have title/genre/year, so fall back to defaults.
    const status = movie.status || "Select status";
    const rating = movie.rating || 0;

    const card = makeElement("article", "card");
    const body = makeElement("div", "card-body");
    body.appendChild(makeElement("h3", "", movie.title));
    body.appendChild(makeElement("p", "meta", `${movie.genre} • ${movie.year}`));
    body.appendChild(
        makeElement("span", "badge badge-" + status.toLowerCase(), status),
    );
    body.appendChild(makeElement("p", "stars", starsText(rating)));

    const actions = makeElement("div", "card-actions");
    const editLink = makeElement("a", "btn", "Edit");
    editLink.href = "/edit.html?id=" + encodeURIComponent(movie.id);
    const deleteButton = makeElement("button", "btn btn-danger", "Delete");
    deleteButton.type = "button";
    deleteButton.addEventListener("click", () => deleteMovie(movie));
    actions.append(editLink, deleteButton);

    card.append(body, actions);
    return card;
}

// ---- CREATE ----
function checkMovie(movie) {
    const year = Number(movie.year);
    if (!movie.title) return "Movie title is required.";
    if (!movie.genre) return "Genre is required.";
    if (movie.status === "Select status" || !movie.status) {
        return "Please select a movie status.";
    }
    if (
        !Number.isInteger(year) ||
        year < 1888 ||
        year > new Date().getFullYear() + 5
    ) {
        return "Please enter a valid year.";
    }
    return null; // null = no problem found
}

movieForm.addEventListener("submit", async (event) => {
  event.preventDefault(); // stop the browser from reloading the page

    const movie = {
        title: titleInput.value.trim(),
        genre: genreInput.value.trim(),
        year: Number(yearInput.value),
        status: statusSelect.value,
        rating: Number(ratingSelect.value),
    };

    const problem = checkMovie(movie);
    if (problem) return showMessage(problem, "error");

    try {
        await apiRequest(MOVIES_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie),
        });
        movieForm.reset();
        showMessage(`"${movie.title}" was added to your watchlist.`);
        await loadMovies();
    } catch (err) {
        showMessage(err.message, "error");
    }
});

// ---- DELETE ----
async function deleteMovie(movie) {
    if (!confirm(`Delete "${movie.title}" from your watchlist?`)) return;

    try {
        await apiRequest(`${MOVIES_URL}/${encodeURIComponent(movie.id)}`, {
        method: "DELETE",
        });
        showMessage(`"${movie.title}" was deleted.`);
    } catch (err) {
        showMessage(err.message, "error"); // e.g. "Movie not found." if already deleted
    }
    await loadMovies(); // refresh the list either way
}

// ---- Filter saved movies ----
filterText.addEventListener("input", renderMovies);
filterStatus.addEventListener("change", renderMovies);

// ---- ONLINE LOOKUP: search OMDb through our backend ----
searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = searchInput.value.trim();
    searchResults.innerHTML = "";

    if (!title) {
        searchStatus.textContent = "Please enter a movie title to search.";
        return;
    }

    searchButton.disabled = true;
    searchStatus.textContent = "Searching...";
    try {
        const body = await apiRequest(
        "/api/search?title=" + encodeURIComponent(title),
        );
        if (body.data.length === 0) {
        searchStatus.textContent =
            body.message || "No movies found for your search.";
        } else {
        searchStatus.textContent = `Showing ${body.data.length} result(s) from OMDb.`;
        body.data.forEach((result) =>
            searchResults.appendChild(createResultCard(result)),
        );
        }
    } catch (err) {
        searchStatus.textContent = err.message;
    } finally {
        searchButton.disabled = false;
    }
});

function createResultCard(result) {
    const card = makeElement("article", "card");
    if (result.poster) {
        const poster = document.createElement("img");
        poster.src = result.poster;
        poster.alt = "Poster of " + result.title;
        poster.loading = "lazy";
        card.appendChild(poster);
    }

    const body = makeElement("div", "card-body");
    body.appendChild(makeElement("h3", "", result.title));
    body.appendChild(makeElement("p", "meta", result.year));
    body.appendChild(
        makeElement(
        "p",
        "meta",
        result.type.charAt(0).toUpperCase() + result.type.slice(1),
        ),
    );

    const actions = makeElement("div", "card-actions");
    const addButton = makeElement(
        "button",
        "btn btn-primary",
        "Add to Watchlist",
    );
    addButton.type = "button";
    addButton.addEventListener("click", () => fillFormFromResult(result));
    actions.appendChild(addButton);

    card.append(body, actions);
    return card;
}

// Copies the chosen OMDb result into the Add Movie form.
// The user still clicks "Add Movie", so the normal CRUD flow stays the same.
async function fillFormFromResult(result) {
    titleInput.value = result.title;
    yearInput.value = parseInt(result.year, 10) || "";
    genreInput.value = "";

    // Ask our backend for the genre (a second OMDb lookup by ID).
    try {
        const body = await apiRequest(
        "/api/search/details/" + encodeURIComponent(result.imdbID),
        );
        if (body.data.genre) genreInput.value = body.data.genre;
        if (body.data.year) yearInput.value = body.data.year;
    } catch {
        // Not fatal: the user can type the genre manually.
    }

    document.getElementById("add-section").scrollIntoView({ behavior: "smooth" });
    if (genreInput.value) {
        showMessage('Form filled from OMDb. Review it, then click "Submit".');
    } else {
        showMessage(
        'Title and year filled in. Please enter a genre, then click "Submit".',
        );
        genreInput.focus();
    }
}

// Load the saved list as soon as the page opens.
loadMovies();
