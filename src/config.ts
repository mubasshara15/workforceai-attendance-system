/**
 * Frontend configuration module.
 *
 * Centralizes runtime configuration for the React app so that values like the
 * backend API location are defined in one place instead of being hardcoded
 * throughout components. Framework-agnostic (no React imports) so it can be
 * reused anywhere in the frontend.
 */

// Local typing for Vite's env object. This project's tsconfig does not pull in
// Vite's client types, so we describe only the variable we use and access it
// through a narrow cast — keeping this module self-contained.
interface AppImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

const env = (import.meta as unknown as { env?: AppImportMetaEnv }).env;

// Default keeps development working with no .env setup required.
const DEFAULT_API_BASE_URL = "http://localhost:5000";

// Use the configured value when present, otherwise fall back to the default.
// Strip any trailing slash so URL building (`${API_BASE_URL}/api/...`) is clean.
export const API_BASE_URL = (
  env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export default API_BASE_URL;