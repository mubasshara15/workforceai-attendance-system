/**
 * Attendance decision engine.
 *
 * A pure, side-effect-free module that decides what should happen when an
 * employee is recognized: check them in, check them out, tell them it is too
 * soon to check out, or report that their attendance for the day is already
 * complete.
 *
 * It is deliberately isolated from Express, the database, and the clock so it
 * can be unit-tested in isolation:
 *   - No imports of the DB, config, or request/response objects.
 *   - The caller passes in the existing record, the current time, and the
 *     policy values, and receives back a plain decision object.
 *
 * The route layer (server/routes/attendance.js) is responsible for reading the
 * existing record, supplying `now`, persisting the result, and turning the
 * decision into an HTTP response / message. This module only decides.
 */

/**
 * The set of decisions this engine can return. Exported as a frozen object so
 * callers reference `ATTENDANCE_ACTIONS.CHECK_IN` instead of duplicating raw
 * strings (avoids typos and keeps the values defined in one place).
 *
 * The CHECK_IN / CHECK_OUT / COMPLETED values match the strings the existing
 * API already returns, so the current contract is preserved. TOO_SOON is new.
 */
export const ATTENDANCE_ACTIONS = Object.freeze({
  CHECK_IN: "checkin",
  CHECK_OUT: "checkout",
  TOO_SOON: "too-soon",
  COMPLETED: "completed",
});

const MS_PER_MINUTE = 60_000;

/**
 * Coerce a stored check-in value into a Date.
 *
 * mysql2 returns DATETIME/TIMESTAMP columns as Date objects by default, but we
 * also accept a string or number defensively so the engine does not depend on
 * the driver's date-handling configuration.
 *
 * @param {unknown} value
 * @returns {Date | null} A valid Date, or null if it cannot be parsed.
 */
function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Decide what to do for an employee who has just been recognized.
 *
 * Rules:
 *   1. No record for the day -> CHECK_IN (records `status`).
 *   2. Record exists and is already checked out -> COMPLETED.
 *   3. Record exists, not yet checked out:
 *        - If at least `minMinutesBeforeCheckout` minutes have elapsed since
 *          check-in -> CHECK_OUT.
 *        - Otherwise -> TOO_SOON, reporting how many whole minutes remain, so
 *          an employee who lingers in front of the camera is not checked out
 *          moments after checking in.
 *
 * Safety choice: if a not-checked-out record has a missing or unparseable
 * check-in time, we allow CHECK_OUT rather than trapping the employee in a
 * permanent TOO_SOON state.
 *
 * @param {{check_in?: unknown, check_out?: unknown} | null | undefined} existingRecord
 *        Today's attendance row, or null/undefined if none exists.
 * @param {Date} now The current time (injected for testability).
 * @param {{minMinutesBeforeCheckout?: number, defaultStatus?: string}} policy
 * @returns {{action: string, status?: string, minutesRemaining?: number}}
 */
export function decideAttendanceAction(existingRecord, now, policy) {
  const minMinutes = Number.isFinite(policy?.minMinutesBeforeCheckout)
    ? policy.minMinutesBeforeCheckout
    : 0;
  const defaultStatus = policy?.defaultStatus ?? "Present";

  // 1. No record yet today -> check in.
  if (!existingRecord) {
    return { action: ATTENDANCE_ACTIONS.CHECK_IN, status: defaultStatus };
  }

  // 2. Already checked in AND out -> nothing left to do today.
  if (existingRecord.check_out) {
    return { action: ATTENDANCE_ACTIONS.COMPLETED };
  }

  // 3. Checked in, not yet out -> decide based on elapsed time.
  const checkIn = toDate(existingRecord.check_in);

  // Defensive: cannot determine elapsed time -> allow check-out.
  if (!checkIn) {
    return { action: ATTENDANCE_ACTIONS.CHECK_OUT };
  }

  const elapsedMinutes = (now.getTime() - checkIn.getTime()) / MS_PER_MINUTE;

  if (elapsedMinutes >= minMinutes) {
    return { action: ATTENDANCE_ACTIONS.CHECK_OUT };
  }

  return {
    action: ATTENDANCE_ACTIONS.TOO_SOON,
    minutesRemaining: Math.max(0, Math.ceil(minMinutes - elapsedMinutes)),
  };
}

export default decideAttendanceAction;