// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Publishable Supabase values (safe to embed — these are the same anon credentials
// already exposed in client bundles). Hard-coded as build-time fallbacks because
// .env is gitignored and the Lovable build environment isn't seeing it, causing
// `createClient(undefined, ...)` → "supabaseUrl is required" at SSR.
const SUPABASE_URL = "https://bxebeiadccrbnaqsniko.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0phrZH8mdg3H1Djrqboa3Q_DAoU-OUe";
const SUPABASE_PROJECT_ID = "bxebeiadccrbnaqsniko";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
    },
  },
});
