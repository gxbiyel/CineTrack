// edit.js: load one movie, edit it (including your review), save with PUT.
const $ = (id) => document.getElementById(id);
const editPanel = $("edit-panel");
const editForm = $("edit-form");
const originalValues = $("original-values");
const titleInput = $("title");
const genreInput = $("genre");
const yearInput = $("year");
const statusSelect = $("status");
const ratingSelect = $("rating");
const reviewInput = $("review");
const posterInput = $("poster");   

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
    yearInput.value = loaded.year;
    statusSelect.value = status;
    ratingSelect.value = String(loaded.rating || 0);
    reviewInput.value = loaded.review || "";
    posterInput.value = loaded.poster || "";  
    syncRating(statusSelect, ratingSelect);
    if (rated && statusOf(loaded) !== "Watched")
      showMessage(
        "This movie had a rating, so its status is now Watched. Save to keep it.",
      );

    originalValues.textContent = [
      "Currently saved:",
      loaded.title,
      `${loaded.genre} • ${loaded.year}`,
      `Status: ${STATUS_LABEL[statusOf(loaded)]}`,
      `Rating: ${loaded.rating || 0}/5`,
    ].join("\n");
    editPanel.hidden = false;
  } catch (err) {
    showMessage(err.message, "error");
  }
}

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!loaded) return;

  const movie = {
    title: titleInput.value.trim(),
    genre: genreInput.value.trim(),
    year: Number(yearInput.value),
    status: statusSelect.value,
    rating: statusSelect.value === "Watched" ? Number(ratingSelect.value) : 0,
    review: reviewInput.value.trim(),
    poster: posterInput.value.trim(),
    plot: loaded.plot || "",
    released: loaded.released || "",
    director: loaded.director || "",
    actors: loaded.actors || "",
  };
  const problem = checkMovie(movie);
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

statusSelect.addEventListener("change", () =>
  syncRating(statusSelect, ratingSelect),
);

loadMovie();
