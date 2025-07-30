import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/**/*metadata*.{test,spec}.{js,jsx,ts,tsx}",
      "src/**/metadata*.{test,spec}.{js,jsx,ts,tsx}",
      "src/**/*Metadata*.{test,spec}.{js,jsx,ts,tsx}",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: [
        "src/types/metadata.ts",
        "src/utils/metadataUtils.ts",
        "src/components/metadata/**",
        "src/components/corpuses/CorpusMetadataSettings.tsx",
        "src/components/documents/DocumentMetadataGrid.tsx",
        "src/graphql/metadataOperations.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
