import express from "express";
import db from "../db/connection.js";

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

    // No record today -> CHECK IN
    if (existing.length === 0) {

      await db.query(
        `
        INSERT INTO attendance
        (
          employee_id,
          attendance_date,
          check_in,
          status
        )
        VALUES (?, CURDATE(), NOW(), 'Present')
        `,
        [employee_id]
      );

      return res.json({
        success: true,
        action: "checkin",
        message: "Check-in successful",
      });
    }

    const attendance = existing[0];

    // Already checked in, not checked out -> CHECK OUT
    if (!attendance.check_out) {

      await db.query(
        `
        UPDATE attendance
        SET check_out = NOW()
        WHERE id = ?
        `,
        [attendance.id]
      );

      return res.json({
        success: true,
        action: "checkout",
        message: "Check-out successful",
      });
    }

    // Already completed attendance
    return res.json({
      success: false,
      action: "completed",
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