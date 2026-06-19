import express from "express";
import db from "../db/connection.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {

    const [employees] = await db.query(`
      SELECT COUNT(*) AS total
      FROM employees
    `);

    const [present] = await db.query(`
      SELECT COUNT(*) AS total
      FROM attendance
      WHERE attendance_date = CURDATE()
      AND status = 'Present'
    `);

    res.json({
      employees: employees[0].total,
      present: present[0].total,
      late: 0,
      absent: 0,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

export default router;