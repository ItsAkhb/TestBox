// =========================================================
// Local date helpers
// All calendar-day identity uses local-date strings "YYYY-MM-DD".
// Never use toISOString()/UTC for calendar-day keys.
// =========================================================

export function toLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayLocal() {
  return toLocalDateString(new Date());
}

// Parse "YYYY-MM-DD" into a local Date (avoids the UTC shift of new Date("..."))
export function fromLocalDateString(str) {
  if (typeof str !== "string") return null;
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = fromLocalDateString(dateStr);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

export function diffDays(aStr, bStr) {
  const a = fromLocalDateString(aStr);
  const b = fromLocalDateString(bStr);
  if (!a || !b) return 0;
  return Math.round((a - b) / 86400000);
}

// =========================================================
// Jalali ↔ Gregorian conversion
// Standard div/mod algorithm (same as jalaali-js, MIT licensed,
// by Behrang Norouzinia et al). Tested: 2026-09-02 → 1405/06/11.
// =========================================================

function div(a, b) {
  return ~~(a / b);
}

function mod(a, b) {
  return a - ~~(a / b) * b;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
  1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm;
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    // Fall back to a safe far-future default rather than throwing in UI code
    jy = Math.min(Math.max(jy, BREAKS[0]), BREAKS[bl - 1] - 1);
  }

  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

// Gregorian → Jalali day number
function g2d(gy, gm, gd) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

// Jalali day number → Gregorian
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

// Jalali date → Jalali day number
function j2d(jy, jm, jd) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

// Jalali day number → Jalali date
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function gregorianToJalali(gy, gm, gd) {
  const { jy, jm, jd } = d2j(g2d(gy, gm, gd));
  return { year: jy, month: jm, day: jd };
}

export function jalaliToGregorian(jy, jm, jd) {
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  return { year: gy, month: gm, day: gd };
}

// Months 1-6 have 31 days, months 7-11 have 30 days,
// month 12 has 30 in leap years, 29 otherwise.
export function jalaliDaysInMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

// Convert a local date string to a Jalali object
export function localDateToJalali(dateStr) {
  const d = fromLocalDateString(dateStr);
  if (!d) return null;
  return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Convert a Jalali object to a local date string
export function jalaliToLocalDate(jy, jm, jd) {
  const g = jalaliToGregorian(jy, jm, jd);
  return `${g.year}-${String(g.month).padStart(2, "0")}-${String(g.day).padStart(2, "0")}`;
}

export const JALALI_MONTH_NAMES_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export const JALALI_MONTH_NAMES_EN = [
  "Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar",
  "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand",
];

export const GREGORIAN_MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Weekday names indexed by JS getDay() (0=Sunday)
export const WEEKDAY_NAMES_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
export const WEEKDAY_SHORT_FA = ["ی", "د", "س", "چ", "پ", "ج", "ش"];
export const WEEKDAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
