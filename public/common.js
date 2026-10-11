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

// ---- Release dates ----
// Saved as "YYYY-MM-DD" (what <input type="date"> uses). Older movies may still hold OMDb's
// "18 Jul 2008"; every helper below understands both and never throws on odd values.
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
// Returns { year, month (0-11), day } for a real calendar date, otherwise null.
function parseDateParts(value) {
  const text = value == null ? "" : String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const omdb = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(text);
  let year, month, day;
  if (iso) {
    [year, month, day] = [+iso[1], +iso[2] - 1, +iso[3]];
  } else if (omdb) {
    year = +omdb[3];
    day = +omdb[1];
    month = MONTHS.findIndex(
      (m) => m.slice(0, 3).toLowerCase() === omdb[2].toLowerCase(),
    );
  } else {
    return null;
  }
  const check = new Date(Date.UTC(year, month, day));
  const real =
    month >= 0 &&
    year >= 1000 &&
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month &&
    check.getUTCDate() === day;
  return real ? { year, month, day } : null;
}
// Any supported date -> "YYYY-MM-DD", or "" when missing/unrecognised ("N/A", a bare year...).
function toIsoDate(value) {
  const p = parseDateParts(value);
  if (!p) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${String(p.year).padStart(4, "0")}-${pad(p.month + 1)}-${pad(p.day)}`;
}
function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseDateParts(value) !== null;
}
// "2008-07-18" -> "July 18, 2008" (short: "Jul 18, 2008"). A bare year or unknown text is
// returned as-is, and missing/"N/A" gives "".
function formatDate(value, short = false) {
  const text = value == null || value === "N/A" ? "" : String(value).trim();
  const p = parseDateParts(text);
  if (!p) return text;
  const month = short ? MONTHS[p.month].slice(0, 3) : MONTHS[p.month];
  return `${month} ${p.day}, ${p.year}`;
}
// What to show for a movie: the full date when we have one, otherwise just the year, otherwise "".
function releaseLabel(movie, short = false) {
  return (
    formatDate(movie.released, short) ||
    (Number(movie.year) ? String(movie.year) : "")
  );
}
// Keeps the date picker inside the range the server accepts.
function setDateLimits(input) {
  input.min = "1888-01-01";
  input.max = `${new Date().getFullYear() + 5}-12-31`;
}

// Same rules for the add form and the edit form.
// The release date is optional when a year is already known (e.g. OMDb only knew the year).
// API-sourced movies (movie.source === "omdb") have locked details that the server takes from
// OMDb, so only their status, rating and review are checked here.
function checkMovie(movie) {
  const locked = isApiMovie(movie);
  const released = movie.released || "";
  const year = released ? Number(released.slice(0, 4)) : Number(movie.year);
  if (!locked) {
    if (released && !isValidIsoDate(released))
      return "Please enter a valid release date.";
    if (!movie.title) return "Movie title is required.";
    if (!movie.genre) return "Genre is required.";
  }
  if (!movie.status) return "Please select a movie status.";
  if (movie.rating > 0 && movie.status !== "Watched")
    return "Only movies marked Watched can be rated.";
  if (movie.review && movie.status !== "Watched")
    return "Only movies marked Watched can be reviewed.";
  if (!locked) {
    if (!released && !year) return "Release date is required.";
    if (movie.poster && !/^https?:\/\/\S+$/i.test(movie.poster))
      return "Please enter a valid poster URL.";
    if (
      !Number.isInteger(year) ||
      year < 1888 ||
      year > new Date().getFullYear() + 5
    ) {
      return "Please enter a valid release date.";
    }
  }
  return null;
}

// ---- API-sourced movies: locked details ----
// Is this saved movie an OMDb movie? The server says so with "source" (and only OMDb movies have
// an IMDb id). Both the Library's Edit page and the Add form use this one rule.
function isApiMovie(movie) {
  return (
    !!movie &&
    (movie.source === "omdb" || /^tt\d{5,10}$/.test(movie.imdbID || ""))
  );
}
// For movies that came from OMDb these seven fields are shown but cannot be edited.
// (The server enforces the same rule, so this is only the friendly side of it.)
const METADATA_FIELD_IDS = [
  "title",
  "genre",
  "released",
  "director",
  "actors",
  "plot",
  "poster",
];
function lockMetadata(locked) {
  METADATA_FIELD_IDS.forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.dataset.placeholder === undefined)
      field.dataset.placeholder = field.placeholder; // remember the original text
    // A date picker has no dependable read-only mode, so it is disabled (its value can still be read).
    if (field.type === "date") field.disabled = locked;
    else field.readOnly = locked;
    field.classList.toggle("is-locked", locked);
    field.placeholder = locked
      ? "Not available from OMDb"
      : field.dataset.placeholder;
  });
}

// Cast is saved as one comma-separated string (the same shape OMDb uses).
// "A,  B ,, C" -> "A, B, C", so the add form and edit form store it identically.
function normalizeCast(value) {
  return String(value || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .join(", ");
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

// ---- Review rule: only "Watched" movies can have a review (same rule as rating) ----
function reviewOf(movie) {
  return statusOf(movie) === "Watched" ? movie.review || "" : "";
}
// Call on load and whenever the status changes.
function syncReview(statusEl, reviewEl) {
  const canReview = statusEl.value === "Watched";
  if (reviewEl.dataset.placeholder === undefined)
    reviewEl.dataset.placeholder = reviewEl.placeholder; // remember the original text
  if (!canReview) reviewEl.value = "";
  reviewEl.disabled = !canReview;
  reviewEl.placeholder = canReview
    ? reviewEl.dataset.placeholder
    : "Available once watched";
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
  // OMDb details are never filled in from this browser's cache; only the user's review is.
  const fields = isApiMovie(movie) ? ["review"] : EXTRA_FIELDS;
  fields.forEach(
    (f) => !merged[f] && cached[f] && (merged[f] = cached[f]),
  );
  return merged;
}
