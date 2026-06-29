/**
 * Attendance API helper.
 *
 * A thin, reusable wrapper around the existing `POST /api/attendance` endpoint
 * so that both the image-upload and live-camera recognition paths can record
 * attendance through the same call instead of duplicating fetch logic.
 *
 * This helper is intentionally transport-only: it contains NO business rules,
 * NO cooldown, and NO check-in/check-out decisions. The request and response
 * formats are unchanged from the current implementation, and all recognition
 * timing/de-duplication remains in the caller.
 */

import { API_BASE_URL } from "../config";

/**
 * Shape of the response returned by the existing attendance endpoint.
 * `action` is typed with the values the server currently sends, plus a string
 * fallback so an unexpected value never breaks the build.
 */
export interface AttendanceResponse {
  success: boolean;
  action?: "checkin" | "checkout" | "completed" | (string & {});
  message?: string;
  error?: string;
}

/**
 * Record attendance for an employee by posting to the existing API.
 *
 * @param employeeId The employee's business ID (sent as `employee_id`),
 *                    matching the current request format.
 * @returns The parsed JSON response from the server.
 */
export async function markAttendance(
  employeeId: string
): Promise<AttendanceResponse> {
  const response = await fetch(`${API_BASE_URL}/api/attendance`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      employee_id: employeeId,
      status: "Present",
    }),
  });

  return response.json();
}