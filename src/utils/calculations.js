// Format minutes to H:MM string (e.g. 570 → "9:30")
export function minutesToHHMM(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '--:--';
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')}`;
}

// Format minutes to "Xh Ym" (e.g. 570 → "9h 30m")
export function minutesToReadable(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '–';
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Parse "HH:MM" string to minutes since midnight
export function timeStringToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Format timestamp (Firestore Timestamp or Date) to "HH:MM"
export function formatTime(ts) {
  if (!ts) return '--:--';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Format timestamp to "DD-Mon-YY"
export function formatDate(ts) {
  if (!ts) return '--';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

// Get local YYYY-MM-DD key for a date
// Uses local calendar values instead of UTC so month/day views stay correct
// in timezones ahead/behind UTC (for example Beirut).
export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get today's date key
export function todayKey() {
  return dateKey(new Date());
}

// Calculate OT/undertime in minutes given worked minutes and scheduled
export function calcOT(workedMinutes, scheduledMinutes) {
  if (workedMinutes === null || workedMinutes === undefined) return null;
  if (!scheduledMinutes) return 0;
  return workedMinutes - scheduledMinutes;
}

// Get all days in a month as YYYY-MM-DD strings
export function getDaysInMonth(year, month) {
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(dateKey(new Date(d)));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Get display month label: "January 2026"
export function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// Get day of week short: "Mon", "Tue" etc.
export function dayOfWeek(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' });
}
