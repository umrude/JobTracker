import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Real `server-only` throws when imported outside a server bundle,
      // which Vitest counts as. Stub it so server-side unit tests can run.
      "server-only": path.resolve(
        import.meta.dirname,
        "./src/test/server-only-stub.ts",
      ),
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Claude Code worktrees under .claude/ hold full copies of the repo,
    // tests included; don't run those duplicates. e2e/ is Playwright's
    // (pnpm test:e2e), which Vitest's *.spec.ts pattern would also match.
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"],
  },
});
