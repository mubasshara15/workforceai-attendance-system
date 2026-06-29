import express from "express";
import cors from "cors";

import config from "./config.js";
import employeeRoutes from "./routes/employees.js";
import attendanceRoutes from "./routes/attendance.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.listen(config.port, () => {
  console.log(`WorkForceAI API running on port ${config.port}`);
});