// app.js: main page (library, add, delete, filter, OMDb discover, shared details popup, reviews).
const MOVIES_URL = "/api/movies";
let allMovies = [];
let currentMovie = null; // library movie shown in the popup
let currentResult = null; // Discover movie shown in the popup
let detailToken = 0; // lets us ignore stale detail responses

const $ = (id) => document.getElementById(id);
const movieForm = $("movie-form");
const titleInput = $("title");
const genreInput = $("genre");
const yearInput = $("year");
const statusSelect = $("status");
const ratingSelect = $("rating");
const reviewField = $("review");
const posterInput = $("poster");
const plotInput = $("plot");
const releasedInput = $("released");
const directorInput = $("director");
const actorsInput = $("actors");
const movieList = $("movie-list");
const movieCount = $("movie-count");
const emptyState = $("empty-state");
const filterText = $("filter-text");
const filterStatus = $("filter-status");
const searchForm = $("search-form");
const searchInput = $("search-input");
const searchButton = $("search-button");
const searchStatus = $("search-status");
const searchResults = $("search-results");
const modal = $("modal");
const reviewInput = $("review-input");

// ---- Helpers ----
// OMDb uses "N/A" for missing values; treat that (and empty/undefined) as "no value".
const clean = (value) => (value && value !== "N/A" ? String(value) : "");
function pick(data, ...keys) {
  for (const key of keys) if (clean(data[key])) return clean(data[key]);
  return "";
}
// First 1-3 names from OMDb's comma-separated "Actors" string.
function parseCast(value) {
  return clean(value)
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 3);
}
// Accepts either lowercase or OMDb-style field names from the backend.
function normalizeDetails(data = {}) {
  return {
    genre: pick(data, "genre", "Genre"),
    year: pick(data, "year", "Year"),
    released: pick(data, "released", "Released", "releaseDate"),
    director: pick(data, "director", "Director"),
    plot: pick(data, "plot", "Plot"),
    poster: pick(data, "poster", "Poster"),
    actors: parseCast(pick(data, "actors", "Actors", "cast")).join(", "),
  };
}
const compact = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v));

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// "15 Oct 2026" (OMDb) or "2026-10-15" -> "October 15, 2026". A bare year or unknown format is returned as-is.
function formatDate(value) {
  const text = clean(value).trim();
  const omdb = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  let year, month, day;
  if (omdb) {
    [year, month, day] = [
      +omdb[3],
      MONTHS.findIndex(
        (m) => m.slice(0, 3).toLowerCase() === omdb[2].toLowerCase(),
      ),
      +omdb[1],
    ];
  } else if (iso) {
    [year, month, day] = [+iso[1], +iso[2] - 1, +iso[3]];
  }
  return MONTHS[month] ? `${MONTHS[month]} ${day}, ${year}` : text;
}

// 2:3 poster box. Shows a clean title placeholder when there is no image or it fails to load.
function posterNode(url, title) {
  const wrap = makeElement("div", "poster");
  const fallback = () => {
    wrap.classList.add("no-poster");
    wrap.replaceChildren(
      makeElement("span", "", title),
      makeElement("small", "", "No poster available"),
    );
  };
  if (clean(url)) {
    const img = document.createElement("img");
    img.referrerPolicy = "no-referrer";
    img.alt = "Poster of " + title;
    img.loading = "lazy";
    img.addEventListener("error", fallback);
    img.src = url;
    wrap.appendChild(img);
  } else {
    fallback();
  }
  return wrap;
}

function makeClickable(card, label, open) {
  card.classList.add("card-click");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", label);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.target === card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open();
    }
  });
}

function statusBadge(status) {
  return makeElement(
    "span",
    "badge badge-" + status.toLowerCase(),
    STATUS_LABEL[status],
  );
}

// ---- Already in library? ----
const movieKey = (title, year) =>
  `${String(title).trim().toLowerCase()}|${parseInt(year, 10) || ""}`;
const isInLibrary = (movie) =>
  allMovies.some(
    (m) => movieKey(m.title, m.year) === movieKey(movie.title, movie.year),
  );

function updateAddButton() {
  const button = $("modal-add");
  const added = !!currentResult && isInLibrary(currentResult);
  button.disabled = added;
  button.textContent = added ? "Added to Library" : "Add to library";
  button.classList.toggle("btn-added", added);
}

// ---- Fade-in on scroll ----
// rootMargin "-35%" means a card appears once it is about 35% of the way up the screen.
// Change to -30% or -40% to taste.
const revealed = new Set(); // cards that already faded in won't replay on re-render (filtering, saving a review)
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            revealed.add(entry.target.dataset.revealKey);
            revealObserver.unobserve(entry.target);
          });
        },
        { rootMargin: "0px 0px -35% 0px", threshold: 0 },
      )
    : null;

function revealOnScroll(card, key) {
  if (!revealObserver || revealed.has(key)) return;
  card.classList.add("reveal");
  card.dataset.revealKey = key;
  revealObserver.observe(card);
}

// ---- READ ----
async function loadMovies() {
  try {
    allMovies = (await apiRequest(MOVIES_URL)).data.map(withExtras);
    if (currentResult) updateAddButton();
    renderMovies();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderMovies() {
  const text = filterText.value.trim().toLowerCase();
  const status = filterStatus.value;
  const visible = allMovies.filter(
    (movie) =>
      (movie.title.toLowerCase().includes(text) ||
        movie.genre.toLowerCase().includes(text)) &&
      (status === "All" || statusOf(movie) === status),
  );

  movieList.innerHTML = "";
  movieCount.textContent = `(${visible.length} of ${allMovies.length})`;
  if (allMovies.length === 0) {
    emptyState.textContent =
      "Your library is empty. Add your first movie above.";
  } else if (visible.length === 0) {
    emptyState.textContent = "No movies match your filter.";
  }
  emptyState.hidden = visible.length > 0;
  visible.forEach((movie) => movieList.appendChild(createMovieCard(movie)));
}

function createMovieCard(movie) {
  const card = makeElement("article", "card");
  const posterWrap = posterNode(movie.poster, movie.title);
  const badge = statusBadge(statusOf(movie));
  badge.classList.add("badge-float");
  posterWrap.appendChild(badge);

  const body = makeElement("div", "card-body");
  body.appendChild(makeElement("h3", "", movie.title));
  body.appendChild(makeElement("p", "meta", `${movie.genre} • ${movie.year}`));
  const rating = ratingOf(movie);
  body.appendChild(
    makeElement("p", rating ? "stars" : "stars unrated", starsText(rating)),
  );
  if (movie.review) body.appendChild(makeElement("p", "snippet", movie.review));

  const actions = makeElement("div", "card-actions");
  const editLink = makeElement("a", "btn", "Edit");
  editLink.href = "/edit.html?id=" + encodeURIComponent(movie.id);
  const deleteButton = makeElement("button", "btn btn-danger", "Delete");
  deleteButton.type = "button";
  deleteButton.addEventListener("click", () => deleteMovie(movie));
  actions.append(editLink, deleteButton);
  actions.addEventListener("click", (e) => e.stopPropagation());

  card.append(posterWrap, body, actions);
  makeClickable(card, "View details for " + movie.title, () =>
    showDetails(movie, "library"),
  );
  revealOnScroll(card, "m:" + movie.id);
  return card;
}

// ---- DETAILS POPUP (one popup for Movie library and Discover) ----
function renderDetails(movie) {
  $("modal-poster").replaceChildren(posterNode(movie.poster, movie.title));
  $("modal-title").textContent = movie.title;

  const facts = $("modal-facts");
  facts.replaceChildren();
  [
    ["Release date", formatDate(movie.released) || clean(movie.year)],
    ["Genre", clean(movie.genre)],
    ["Director", clean(movie.director)],
  ].forEach(([label, value]) => {
    facts.append(
      makeElement("dt", "", label),
      makeElement("dd", value ? "" : "muted", value || "Not available"),
    );
  });

  const plot = $("modal-plot");
  plot.textContent = clean(movie.plot) || "No plot available.";
  plot.classList.toggle("muted", !clean(movie.plot));

  const cast = $("modal-cast");
  cast.replaceChildren();
  const names = parseCast(movie.actors);
  if (names.length)
    names.forEach((name) => cast.appendChild(makeElement("li", "", name)));
  else cast.appendChild(makeElement("li", "muted", "Not available"));
}

// mode: "library" (status, rating, review, edit) or "discover" (add to library).
function showDetails(movie, mode) {
  detailToken++;
  currentMovie = mode === "library" ? movie : null;
  currentResult = mode === "discover" ? movie : null;
  modal
    .querySelectorAll("[data-only]")
    .forEach((el) => (el.hidden = el.dataset.only !== mode));
  renderDetails(movie);
  if (mode === "discover") updateAddButton();

  if (mode === "library") {
    const status = statusOf(movie);
    const rating = ratingOf(movie);
    $("modal-status").textContent = STATUS_LABEL[status];
    $("modal-status").className = "badge badge-" + status.toLowerCase();
    $("modal-stars").textContent = starsText(rating);
    $("modal-stars").className = rating ? "stars" : "stars unrated";
    $("modal-edit").href = "/edit.html?id=" + encodeURIComponent(movie.id);
    showReview(false);
  }
  modal.hidden = false;
  document.body.classList.add("modal-open");
  $("modal-close").focus();
}

function closeModal() {
  detailToken++;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  currentMovie = currentResult = null;
}

// Discover: open right away with what the search gave us, then fill in the details.
async function openDiscover(result) {
  const base = {
    title: result.title,
    year: clean(result.year),
    poster: clean(result.poster),
    imdbID: result.imdbID,
  };
  showDetails(base, "discover");
  const token = detailToken;
  $("modal-plot").textContent = "Loading details...";
  $("modal-plot").classList.add("muted");
  try {
    const body = await apiRequest(
      "/api/search/details/" + encodeURIComponent(result.imdbID),
    );
    if (token !== detailToken) return;
    console.debug("OMDb details from server for", result.imdbID, body.data); // shows which fields your route returns
    currentResult = { ...base, ...compact(normalizeDetails(body.data)) };
  } catch {
    if (token !== detailToken) return;
  }
  renderDetails(currentResult);
  updateAddButton();
}

// editing = false: read the saved review. editing = true: show the textarea.
function showReview(editing) {
  const review = currentMovie.review || "";
  const reviewText = $("modal-review");
  reviewText.textContent = review || "You haven't reviewed this movie yet.";
  reviewText.classList.toggle("empty", !review);
  reviewText.hidden = editing;
  reviewInput.hidden = !editing;
  $("review-edit").hidden = editing;
  $("review-edit").textContent = review ? "Edit review" : "Write review";
  $("review-save").hidden = !editing;
  $("review-cancel").hidden = !editing;
  if (editing) {
    reviewInput.value = review;
    reviewInput.focus();
  }
}

async function saveReview() {
  const movie = currentMovie;
  const review = reviewInput.value.trim();
  const updated = {
    title: movie.title,
    genre: movie.genre,
    year: movie.year,
    status: statusOf(movie),
    rating: ratingOf(movie),
    review,
    poster: movie.poster || "",
    plot: movie.plot || "",
    released: movie.released || "",
    director: movie.director || "",
    actors: movie.actors || "",
  };
  try {
    await apiRequest(`${MOVIES_URL}/${encodeURIComponent(movie.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    movie.review = review;
    saveExtras(movie);
    showReview(false);
    renderMovies();
    showMessage("Review saved.");
  } catch (err) {
    showMessage(err.message, "error");
  }
}

$("modal-close").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.hidden) closeModal();
});
$("review-edit").addEventListener("click", () => showReview(true));
$("review-cancel").addEventListener("click", () => showReview(false));
$("review-save").addEventListener("click", saveReview);
$("modal-add").addEventListener("click", () => {
  const movie = currentResult;
  closeModal();
  if (movie) useInForm(movie);
});

// ---- CREATE ----
statusSelect.addEventListener("change", () =>
  syncRating(statusSelect, ratingSelect),
);
syncRating(statusSelect, ratingSelect);

movieForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = statusSelect.value;
  const movie = {
    title: titleInput.value.trim(),
    genre: genreInput.value.trim(),
    year: Number(yearInput.value),
    status,
    rating: status === "Watched" ? Number(ratingSelect.value) : 0, // only watched movies can be rated
    review: reviewField.value.trim(),
    poster: posterInput.value.trim(),
    plot: plotInput.value,
    released: releasedInput.value,
    director: directorInput.value,
    actors: actorsInput.value,
  };
  const problem = checkMovie(movie);
  if (problem) return showMessage(problem, "error");

  try {
    await apiRequest(MOVIES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie),
    });
    saveExtras(movie);
    movieForm.reset();
    [posterInput, plotInput, releasedInput, directorInput, actorsInput].forEach(
      (input) => (input.value = ""),
    );
    syncRating(statusSelect, ratingSelect);
    showMessage(`"${movie.title}" was added to your library.`);
    await loadMovies();
  } catch (err) {
    showMessage(err.message, "error");
  }
});

// ---- DELETE ----
async function deleteMovie(movie) {
  if (!confirm(`Delete "${movie.title}" from your library?`)) return;
  try {
    await apiRequest(`${MOVIES_URL}/${encodeURIComponent(movie.id)}`, {
      method: "DELETE",
    });
    showMessage(`"${movie.title}" was deleted.`);
  } catch (err) {
    showMessage(err.message, "error");
  }
  await loadMovies();
}

filterText.addEventListener("input", renderMovies);
filterStatus.addEventListener("change", renderMovies);

// ---- OMDb DISCOVER ----
// One helper for featured + search. The token drops stale responses so results never mix.
let searchToken = 0;
async function runSearch(url, loadingText, doneText) {
  const token = ++searchToken;
  searchStatus.textContent = loadingText;
  try {
    const body = await apiRequest(url);
    if (token !== searchToken) return;
    searchResults.replaceChildren(); // clear only once new data arrives, so typing doesn't flicker
    if (body.data.length === 0) {
      searchStatus.textContent =
        body.message || "No movies found for your search.";
      return;
    }
    searchStatus.textContent = doneText(body.data.length);
    body.data.forEach((result) =>
      searchResults.appendChild(createResultCard(result)),
    );
  } catch (err) {
    if (token !== searchToken) return;
    searchResults.replaceChildren();
    searchStatus.textContent = err.message;
  }
}

function loadFeatured() {
  return runSearch(
    "/api/search/featured",
    "Loading movies from OMDb...",
    (n) => `Showing ${n} movies from OMDb. Search for a specific title above.`,
  );
}

const SEARCH_DELAY = 400; // ms to wait after the last keystroke
const MIN_CHARS = 3; // OMDb answers "Too many results" for 1-2 letters
let searchTimer;

function searchMovies() {
  const title = searchInput.value.trim();
  if (!title) return loadFeatured(); // cleared the box -> back to featured
  if (title.length < MIN_CHARS) {
    searchToken++; // cancel any request still in flight
    searchStatus.textContent = `Type at least ${MIN_CHARS} characters to search.`;
    return;
  }
  return runSearch(
    "/api/search?title=" + encodeURIComponent(title),
    "Searching...",
    (n) => `Showing ${n} result(s) from OMDb.`,
  );
}

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchMovies, SEARCH_DELAY);
});

// Enter (or the button) still works and searches immediately
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearTimeout(searchTimer);
  searchMovies();
});

function createResultCard(result) {
  const card = makeElement("article", "card");
  const body = makeElement("div", "card-body");
  body.appendChild(makeElement("h3", "", result.title));
  const type = result.type || "movie";
  body.appendChild(
    makeElement(
      "p",
      "meta",
      `${clean(result.year)} • ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    ),
  );
  card.append(posterNode(result.poster, result.title), body);
  makeClickable(card, "View details for " + result.title, () =>
    openDiscover(result),
  );
  revealOnScroll(card, "r:" + result.imdbID);
  return card;
}

// Copies a Discover movie (poster, plot, director, release date included) into the Add form.
function useInForm(movie) {
  titleInput.value = movie.title;
  yearInput.value = parseInt(movie.year, 10) || "";
  genreInput.value = movie.genre || "";
  posterInput.value = movie.poster || "";
  plotInput.value = movie.plot || "";
  releasedInput.value = movie.released || "";
  directorInput.value = movie.director || "";
  actorsInput.value = movie.actors || "";

  $("add-section").scrollIntoView({ behavior: "smooth" });
  if (genreInput.value) {
    showMessage(
      'Form filled from OMDb. Pick a status, then click "Add to library".',
    );
  } else {
    showMessage(
      "Title and year filled in. Enter a genre and pick a status to finish.",
    );
    genreInput.focus();
  }
}

loadMovies();
loadFeatured();
