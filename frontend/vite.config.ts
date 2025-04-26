import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    css: true,
    reporters: ["verbose"],
    // More specific include pattern
    include: ["src/**/*.test.{ts,tsx}"],
    // Explicitly exclude Playwright directories and node_modules
    exclude: [
      "node_modules",
      "tests",
      "tests-examples",
      "dist",
      ".idea",
      ".git",
      ".cache",
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      // Adjust coverage include/exclude if needed, based on the new test patterns
      include: ["src/**/*.{ts,tsx}"], // Keep covering src
      exclude: [
        "src/**/*.test.{ts,tsx}", // Exclude test files themselves
        "src/setupTests.ts", // Exclude setup file
        "src/main.tsx", // Exclude entry point if desired
        // Add any other files/patterns to exclude from coverage
      ],
    },
  },
});
