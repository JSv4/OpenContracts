import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path"; // Import path module

// Custom plugin to handle asset imports in Playwright tests
const assetPlugin = () => {
  return {
    name: "asset-plugin",
    load(id: string) {
      // Handle image imports by returning a mock URL
      if (id.match(/\.(png|jpe?g|gif|svg|webp)$/)) {
        return `export default "${path.basename(id)}";`;
      }
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react(), assetPlugin()],
  // Add asset handling for Playwright tests
  assetsInclude: [
    "**/*.png",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.svg",
    "**/*.gif",
    "**/*.webp",
  ],
  // Better handling of assets in all environments
  resolve: {
    alias: {
      // Standard path aliases if needed
      "@": path.resolve(__dirname, "src"),
    },
  },
  // Handle static asset imports better in tests
  define: {
    // Add TEST environment variable that code can check
    // This will be false in production/development
    "import.meta.env.TEST": JSON.stringify(false),
  },
  build: {
    // Ensure proper handling of asset files
    assetsInlineLimit: 4096, // 4kb - files smaller than this will be inlined as base64
    rollupOptions: {
      output: {
        // Ensure proper handling of assets, especially for testing
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
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
    alias: {
      "^.+\\.(css|less|scss|sass|png|jpg|jpeg|gif|svg|webp)$": path.resolve(
        __dirname,
        "src/__mocks__/fileMock.ts"
      ),
    },
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
