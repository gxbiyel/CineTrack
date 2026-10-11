// dates.js: shared by the routes. Release dates are stored as "YYYY-MM-DD" (or "" when unknown).
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Accepts "2008-07-18" or OMDb's "18 Jul 2008" (also legacy saved values) and returns:
//   "YYYY-MM-DD" for a real calendar date,
//   ""           when there is no date ("", "N/A", missing),
//   null         when a value was given but is not a valid date.
function normalizeReleaseDate(value) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.toUpperCase() === "N/A") return "";

    let year, month, day, match;
    if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text))) {
        [year, month, day] = [+match[1], +match[2], +match[3]];
    } else if ((match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(text))) {
        [year, month, day] = [+match[3], MONTHS.indexOf(match[2].toLowerCase()) + 1, +match[1]];
    } else {
        return null;
    }

    // Reject things like 2023-02-31 or month 13.
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
        month < 1 ||
        year < 1000 ||
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        return null;
    }
    const pad = (n) => String(n).padStart(2, "0");
    return `${year}-${pad(month)}-${pad(day)}`;
}

module.exports = { normalizeReleaseDate };
