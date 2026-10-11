// edit.js: load one movie, edit it (including your review), save with PUT.
const $ = (id) => document.getElementById(id);
const editPanel = $("edit-panel");
const editForm = $("edit-form");
const titleInput = $("title");
const genreInput = $("genre");
const yearInput = $("year"); // hidden: the saved year, used when a movie has no release date
const releasedInput = $("released");
const statusSelect = $("status");
const ratingSelect = $("rating");
const reviewInput = $("review");
const posterInput = $("poster");
const directorInput = $("director");
const actorsInput = $("actors");
const plotInput = $("plot");

setDateLimits(releasedInput);

const movieId = new URLSearchParams(window.location.search).get("id");
let loaded = null; // the movie as saved, so poster and plot are kept when we save

async function loadMovie() {
  if (!movieId) {
    return showMessage(
      "No movie selected. Go back and click Edit on a movie.",
      "error",
    );
  }
  try {
    loaded = withExtras(
      (await apiRequest("/api/movies/" + encodeURIComponent(movieId))).data,
    );
    const rated = (loaded.rating || 0) > 0;
    const status = rated ? "Watched" : statusOf(loaded); // a rating means it was watched

    titleInput.value = loaded.title;
    genreInput.value = loaded.genre;
    yearInput.value = loaded.year || "";
    releasedInput.value = toIsoDate(loaded.released); // empty if the date is unknown
    statusSelect.value = status;
    ratingSelect.value = String(loaded.rating || 0);
    reviewInput.value = loaded.review || "";
    posterInput.value = loaded.poster || "";
    directorInput.value = loaded.director || "";
    actorsInput.value = loaded.actors || "";
    plotInput.value = loaded.plot || "";
    syncRating(statusSelect, ratingSelect);
    syncReview(statusSelect, reviewInput);
    // Movies that came from OMDb keep their details; only status, rating and review can change.
    const fromApi = isApiMovie(loaded);
    lockMetadata(fromApi);
    $("source-note").hidden = !fromApi;
    if (rated && statusOf(loaded) !== "Watched")
      showMessage(
        "This movie had a rating, so its status is now Watched. Save to keep it.",
      );
    editPanel.hidden = false;
  } catch (err) {
    showMessage(err.message, "error");
  }
}

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loaded) return;

  const released = releasedInput.value; // "YYYY-MM-DD", or "" when cleared
  const movie = {
    title: titleInput.value.trim(),
    genre: genreInput.value.trim(),
    // the year follows the release date; with no date we keep the saved year
    year: released ? Number(released.slice(0, 4)) : Number(yearInput.value),
    status: statusSelect.value,
    rating: statusSelect.value === "Watched" ? Number(ratingSelect.value) : 0,
    review: statusSelect.value === "Watched" ? reviewInput.value.trim() : "",
    poster: posterInput.value.trim(),
    plot: plotInput.value.trim(),
    released,
    director: directorInput.value.trim(),
    actors: normalizeCast(actorsInput.value),
  };
  if (isApiMovie(loaded)) {
    // Locked details go back exactly as saved. (The server ignores them for OMDb movies anyway.)
    Object.assign(movie, {
      title: loaded.title,
      genre: loaded.genre,
      year: loaded.year,
      released: toIsoDate(loaded.released),
      poster: loaded.poster || "",
      plot: loaded.plot || "",
      director: loaded.director || "",
      actors: loaded.actors || "",
    });
  }
  const problem = checkMovie({ ...movie, source: isApiMovie(loaded) ? "omdb" : "manual" });
  if (problem) return showMessage(problem, "error");

  try {
    await apiRequest("/api/movies/" + encodeURIComponent(movieId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    saveExtras(movie);
    showMessage("Movie updated. Returning to your library...");
    setTimeout(() => (window.location.href = "/"), 1200);
  } catch (err) {
    showMessage(err.message, "error");
  }
});

statusSelect.addEventListener("change", () => {
  syncRating(statusSelect, ratingSelect);
  syncReview(statusSelect, reviewInput);
});

loadMovie();
