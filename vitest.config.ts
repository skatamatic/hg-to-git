import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "backend",
          include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
          environment: "node",
          coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: "./coverage/backend",
            include: ["src/**/*.ts"],
            exclude: [
              "src/**/*.test.ts",
              "src/electron/**",
              "src/server/**",
              "src/workers/**",
              "src/cli.ts",
            ],
          },
        },
      },
      "./web/vitest.config.ts",
    ],
  },
});
