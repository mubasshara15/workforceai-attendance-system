import express from "express";
import db from "../db/connection.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const [rows] = await db.query(
    "SELECT * FROM employees"
  );

  res.json(rows);
});

router.post("/", async (req, res) => {
  const {
    employee_id,
    name,
    email,
    department,
    role,
    image_url,
    face_descriptor,
  } = req.body;

  await db.query(
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
      email,
      department,
      role,
      image_url,
      face_descriptor,
    ]
  );

  res.json({
    success: true,
  });
});

export default router;