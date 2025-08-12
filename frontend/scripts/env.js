const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load environment variables from common locations (dev friendliness)
const candidateEnvPaths = [
  path.resolve(".env.local"),
  path.resolve(".env"),
  // Repo-level sample location used by this project: ../../.envs/.local/.frontend
  path.resolve(__dirname, "../../.envs/.local/.frontend"),
];
for (const p of candidateEnvPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

// Helper to read from either plain REACT_APP_* or OPEN_CONTRACTS_REACT_APP_* (container-style) keys
const VITE_FALLBACK_KEYS = {
  REACT_APP_APPLICATION_DOMAIN: "VITE_APPLICATION_DOMAIN",
  REACT_APP_APPLICATION_CLIENT_ID: "VITE_APPLICATION_CLIENT_ID",
  REACT_APP_AUDIENCE: "VITE_AUDIENCE",
  REACT_APP_API_ROOT_URL: "VITE_API_ROOT_URL",
  REACT_APP_USE_AUTH0: "VITE_USE_AUTH0",
  REACT_APP_USE_ANALYZERS: "VITE_USE_ANALYZERS",
  REACT_APP_ALLOW_IMPORTS: "VITE_ALLOW_IMPORTS",
};

const readEnv = (key) =>
  process.env[key] ??
  process.env[`OPEN_CONTRACTS_${key}`] ??
  process.env[VITE_FALLBACK_KEYS[key]] ??
  "";

// Build the runtime env object explicitly so missing vars are safely defaulted
const runtimeEnv = {
  REACT_APP_APPLICATION_DOMAIN: readEnv("REACT_APP_APPLICATION_DOMAIN"),
  REACT_APP_APPLICATION_CLIENT_ID: readEnv("REACT_APP_APPLICATION_CLIENT_ID"),
  REACT_APP_AUDIENCE: readEnv("REACT_APP_AUDIENCE"),
  REACT_APP_API_ROOT_URL: readEnv("REACT_APP_API_ROOT_URL"),
  REACT_APP_USE_AUTH0: String(readEnv("REACT_APP_USE_AUTH0")),
  REACT_APP_USE_ANALYZERS: String(readEnv("REACT_APP_USE_ANALYZERS")),
  REACT_APP_ALLOW_IMPORTS: String(readEnv("REACT_APP_ALLOW_IMPORTS")),
};

// Define file path (served statically by Vite from /public)
const envFile = path.resolve("./public/env-config.js");

// Ensure public directory exists
const publicDir = path.resolve("./public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Write the window._env_ payload
const content = `window._env_ = ${JSON.stringify(runtimeEnv, null, 2)};\n`;
fs.writeFileSync(envFile, content, "utf8");

console.log("Environment variables written to public/env-config.js");
