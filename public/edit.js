// edit.js: logic for edit.html (load one movie, edit it, save with PUT).
const messageBox = document.getElementById("message");
const editPanel = document.getElementById("edit-panel");
const editForm = document.getElementById("edit-form");
const originalValues = document.getElementById("original-values");
const titleInput = document.getElementById("title");
const genreInput = document.getElementById("genre");
const yearInput = document.getElementById("year");
const statusSelect = document.getElementById("status");
const ratingSelect = document.getElementById("rating");

// The movie ID comes from the URL: edit.html?id=...
const movieId = new URLSearchParams(window.location.search).get("id");

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

// Step 1: load the existing movie and pre-fill the form.
async function loadMovie() {
    if (!movieId) {
        return showMessage(
        "No movie selected. Go back and click Edit on a movie.",
        "error",
        );
    }
    try {
        const body = await apiRequest("/api/movies/" + encodeURIComponent(movieId));
        const movie = body.data;

        titleInput.value = movie.title;
        genreInput.value = movie.genre;
        yearInput.value = movie.year;
        statusSelect.value = movie.status || "Planned";
        ratingSelect.value = String(movie.rating || 0);

        // Display the old values so it is clear what was loaded before editing.
        originalValues.textContent = `Currently saved:
        \n${movie.title}
        \n${movie.genre} • ${movie.year}
        \nStatus: ${movie.status || "Planned"} 
        \nRating: ${movie.rating || 0}/5`;
        editPanel.hidden = false;
    } catch (err) {
        showMessage(err.message, "error"); // e.g. "Movie not found."
    }
}

// Step 2: send the changes with a PUT request.
editForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const movie = {
        title: titleInput.value.trim(),
        genre: genreInput.value.trim(),
        year: Number(yearInput.value),
        status: statusSelect.value,
        rating: Number(ratingSelect.value),
    };

    if (!movie.title) return showMessage("Movie title is required.", "error");
    if (!movie.genre) return showMessage("Genre is required.", "error");
    if (
        !Number.isInteger(movie.year) ||
        movie.year < 1888 ||
        movie.year > new Date().getFullYear() + 5
    ) {
        return showMessage("Please enter a valid year.", "error");
    }

    try {
        await apiRequest("/api/movies/" + encodeURIComponent(movieId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(movie),
        });
        showMessage("Movie updated successfully. Returning to your watchlist...");
        setTimeout(() => (window.location.href = "/"), 1200);
    } catch (err) {
        showMessage(err.message, "error");
    }
});

loadMovie();
