import dotenv from "dotenv";

// Load environment variables from the project-root .env file.
// (Running `npm run server` executes from the project root, so dotenv
// finds .env there by default — matching the repo's existing convention.)
dotenv.config();

/**
 * Read an environment variable that must be present.
 * Throws immediately at startup with a clear message if it is missing,
 * so configuration problems surface before the server accepts requests.
 */
function requireEnv(name) {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill in the value.`
    );
  }

  return value;
}

/**
 * Read an optional environment variable, falling back to a default.
 */
function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

/**
 * Read an optional numeric environment variable. Falls back to the default
 * when the variable is missing or is not a finite number, so a bad value
 * can never silently become NaN.
 */
function numberEnv(name, fallback) {
  const parsed = Number(optionalEnv(name, fallback));
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

const config = {
  // HTTP server port (defaults to 5000 to preserve existing behavior).
  port: Number(optionalEnv("PORT", "5000")),

  // MySQL connection settings.
  db: {
    host: optionalEnv("DB_HOST", "localhost"),
    port: Number(optionalEnv("DB_PORT", "3306")),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
  },

  // Attendance policy. These are business rules (not recognition/UI timers)
  // and are intentionally configurable so deployments can adjust them and
  // future policies can extend this block without changing core logic.
  attendance: {
    // Minimum minutes that must elapse after check-in before a later
    // recognition is treated as a check-out. Prevents an employee who stays
    // in view of the camera from being checked out moments after checking in.
    minMinutesBeforeCheckout: numberEnv(
      "ATTENDANCE_MIN_MINUTES_BEFORE_CHECKOUT",
      "60"
    ),

    // Status recorded when an employee checks in. Kept configurable so a
    // future "Late" policy (based on a cutoff time) can build on it.
    defaultStatus: optionalEnv("ATTENDANCE_DEFAULT_STATUS", "Present"),
  },
};

export default config;