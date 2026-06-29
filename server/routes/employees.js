import express from "express";
import db from "../db/connection.js";

const router = express.Router();

/**
 * Fields that must be present (and non-blank) for an employee record to be
 * usable by the system:
 *   - employee_id:    business key the attendance API matches on
 *   - name:           shown throughout the UI
 *   - face_descriptor: required for face recognition to work at all
 * The remaining fields (email, department, role, image_url) are optional
 * metadata and default to NULL when omitted.
 */
const REQUIRED_FIELDS = ["employee_id", "name", "face_descriptor"];

/**
 * Return the list of required fields that are missing or blank in `body`.
 * @param {Record<string, unknown>} body
 * @returns {string[]}
 */
function findMissingFields(body) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = body?.[field];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim() === "")
    );
  });
}

// Get all employees
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM employees");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Create an employee
router.post("/", async (req, res) => {
  try {
    const {
      employee_id,
      name,
      email,
      department,
      role,
      image_url,
      face_descriptor,
    } = req.body ?? {};

    // Validate required fields before touching the database.
    const missing = findMissingFields(req.body ?? {});
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required field(s): ${missing.join(", ")}`,
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO employees
      (
        employee_id,
        name,
        email,
        department,
        role,
        image_url,
        face_descriptor
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employee_id,
        name,
        email ?? null,
        department ?? null,
        role ?? null,
        image_url ?? null,
        face_descriptor,
      ]
    );

    // Return the new database ID so the client can use it immediately
    // (e.g. for deletes / ID-based matching) without reloading the list.
    res.json({
      success: true,
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);

    // A duplicate employee_id (once a UNIQUE constraint exists) is a client
    // error, not a server fault -> 409 Conflict.
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "An employee with that employee_id already exists.",
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// Delete an employee by database ID
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "DELETE FROM employees WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

export default router;