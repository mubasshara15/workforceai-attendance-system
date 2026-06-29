import express from "express";
import db from "../db/connection.js";
import config from "../config.js";
import {
  decideAttendanceAction,
  ATTENDANCE_ACTIONS,
} from "../lib/attendancePolicy.js";

const router = express.Router();

// Get attendance history
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT *
      FROM attendance
      ORDER BY check_in DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Save attendance
router.post("/", async (req, res) => {
  try {
    const { employee_id } = req.body;

    const [existing] = await db.query(
      `
      SELECT *
      FROM attendance
      WHERE employee_id = ?
      AND attendance_date = CURDATE()
      `,
      [employee_id]
    );

    // Delegate the check-in / check-out / too-soon / completed decision to the
    // pure policy engine. It receives today's record (or null when there is no
    // record yet), the current time, and the configured attendance policy, and
    // returns the action to perform. The route stays thin: it only persists the
    // result and shapes the HTTP response.
    const decision = decideAttendanceAction(
      existing[0] ?? null,
      new Date(),
      config.attendance
    );

    // No record today -> CHECK IN
    if (decision.action === ATTENDANCE_ACTIONS.CHECK_IN) {
      await db.query(
        `
        INSERT INTO attendance
        (
          employee_id,
          attendance_date,
          check_in,
          status
        )
        VALUES (?, CURDATE(), NOW(), ?)
        `,
        [employee_id, decision.status]
      );

      return res.json({
        success: true,
        action: ATTENDANCE_ACTIONS.CHECK_IN,
        message: "Check-in successful",
      });
    }

    // Checked in, enough time elapsed, not yet checked out -> CHECK OUT
    if (decision.action === ATTENDANCE_ACTIONS.CHECK_OUT) {
      await db.query(
        `
        UPDATE attendance
        SET check_out = NOW()
        WHERE id = ?
        `,
        [existing[0].id]
      );

      return res.json({
        success: true,
        action: ATTENDANCE_ACTIONS.CHECK_OUT,
        message: "Check-out successful",
      });
    }

    // Checked in, but not enough time has elapsed to allow check-out yet.
    // No database change is made.
    if (decision.action === ATTENDANCE_ACTIONS.TOO_SOON) {
      return res.json({
        success: false,
        action: ATTENDANCE_ACTIONS.TOO_SOON,
        message:
          `Check-out not allowed yet. Please try again in ` +
          `${decision.minutesRemaining} minute(s).`,
        minutesRemaining: decision.minutesRemaining,
      });
    }

    // Already completed attendance for the day. No database change is made.
    return res.json({
      success: false,
      action: ATTENDANCE_ACTIONS.COMPLETED,
      message: "Attendance already completed today",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;