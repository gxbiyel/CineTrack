// common.js: helpers shared by index.html and edit.html (load before the page script).
// Saved value stays "Planned" so your backend validation keeps working; the label shown is "Watchlist".
const STATUS_LABEL = {
  Planned: "Planned",
  Watching: "Watching",
  Watched: "Watched",
};
const statusOf = (movie) =>
  STATUS_LABEL[movie.status] ? movie.status : "Planned";

const messageBox = document.getElementById("message");
let messageTimer, hideTimer;
function showMessage(text, type = "success") {
  clearTimeout(messageTimer);
  clearTimeout(hideTimer);
  messageBox.textContent = text;
  messageBox.className = "message " + type;
  messageBox.hidden = false;
  requestAnimationFrame(() => messageBox.classList.add("show"));
  messageTimer = setTimeout(() => {
    messageBox.classList.remove("show");
    hideTimer = setTimeout(() => (messageBox.hidden = true), 300);
  }, 5000);
}

// Sends a request and returns parsed JSON; throws an Error with a readable message on failure.
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
  if (!response.ok || !body.success)
    throw new Error(body.message || "Something went wrong.");
  return body;
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function starsText(rating) {
  return rating > 0 ? "★".repeat(rating) + "☆".repeat(5 - rating) : "Not rated";
}

// Same rules for the add form and the edit form.
function checkMovie(movie) {
  const year = Number(movie.year);
  if (!movie.title) return "Movie title is required.";
  if (!movie.genre) return "Genre is required.";
  if (!movie.status) return "Please select a movie status.";
  if (movie.rating > 0 && movie.status !== "Watched")
    return "Only movies marked Watched can be rated.";
  if (movie.poster && !/^https?:\/\/\S+$/i.test(movie.poster))
    return "Please enter a valid poster URL.";
  if (
    !Number.isInteger(year) ||
    year < 1888 ||
    year > new Date().getFullYear() + 5
  ) {
    return "Please enter a valid year.";
  }
  return null;
}

// ---- Rating rule: only "Watched" movies can be rated ----
function ratingOf(movie) {
  return statusOf(movie) === "Watched" ? movie.rating || 0 : 0;
}
// Call on load and whenever the status changes.
function syncRating(statusEl, ratingEl) {
  const canRate = statusEl.value === "Watched";
  if (!canRate) ratingEl.value = "0";
  ratingEl.disabled = !canRate;
  ratingEl.options[0].text = canRate ? "Not rated" : "Available once watched";
}

// ---- Safety net for poster/plot/director/release date ----
// If the server does not store these fields, they are remembered in this browser instead.
// Once your backend saves them, the server's values win automatically.
const EXTRA_FIELDS = ["poster", "plot", "director", "released", "actors", "review"];
const extrasKey = (movie) =>
  `${String(movie.title).toLowerCase()}|${movie.year}`;
function readExtras() {
  try {
    return JSON.parse(localStorage.getItem("cinetrack.extras")) || {};
  } catch {
    return {};
  }
}
function saveExtras(movie) {
  const extras = {};
  EXTRA_FIELDS.forEach((f) => movie[f] && (extras[f] = movie[f]));
  try {
    const all = readExtras();
    if (Object.keys(extras).length)
      all[extrasKey(movie)] = extras; // overwrite, don't merge
    else delete all[extrasKey(movie)]; // nothing left, so clear the entry
    localStorage.setItem("cinetrack.extras", JSON.stringify(all));
  } catch {
    /* storage full or blocked: ignore */
  }
}
function withExtras(movie) {
  const cached = readExtras()[extrasKey(movie)] || {};
  const merged = { ...movie };
  EXTRA_FIELDS.forEach(
    (f) => !merged[f] && cached[f] && (merged[f] = cached[f]),
  );
  return merged;
}
