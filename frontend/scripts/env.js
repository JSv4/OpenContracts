const fs = require("fs");
const path = require("path");

// Load environment variables from .env.local if it exists
require("dotenv").config({ path: ".env.local" });

const template = `window._env_ = {
  REACT_APP_APPLICATION_DOMAIN: "%REACT_APP_APPLICATION_DOMAIN%",
  REACT_APP_APPLICATION_CLIENT_ID: "%REACT_APP_APPLICATION_CLIENT_ID%",
  REACT_APP_AUDIENCE: "%REACT_APP_AUDIENCE%",
  REACT_APP_API_ROOT_URL: "%REACT_APP_API_ROOT_URL%",
  REACT_APP_USE_AUTH0: "%REACT_APP_USE_AUTH0%"
};`;

// Define file paths
const envFile = path.resolve("./public/env.js");

// Create env.js from template if it doesn't exist
if (!fs.existsSync(envFile)) {
  fs.writeFileSync(envFile, template);
  console.log("Created env.js from template");
}

// Read the env.js file
let content = fs.readFileSync(envFile, "utf8");

// Replace all placeholders with actual env values
Object.keys(process.env).forEach((key) => {
  const value = process.env[key] || "";
  content = content.replace(new RegExp(`%${key}%`, "g"), value);
});

// Write the processed content back
fs.writeFileSync(envFile, content);

console.log("Environment variables injected into env.js");
