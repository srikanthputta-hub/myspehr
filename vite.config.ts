import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Standalone Vite config (no Lovable tooling). Targets Cloudflare Workers via
// nitro's cloudflare-module preset — this is what actually builds/deploys the
// Worker, not @cloudflare/vite-plugin. Redirects TanStack Start's server entry
// to src/server.ts (our SSR error wrapper); wrangler.jsonc's `main` alone is
// insufficient, the build entry has to match too. Mirrors spehr.live's
// vite.config.ts (same repo family, same de-Lovable-ified pattern).
export default defineConfig({
  resolve: {
    alias: {
      "@": `${process.cwd()}/src`,
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  // Vite uses PostCSS in dev and Lightning CSS at build by default; forcing
  // lightningcss in both keeps dev preview and the built output consistent.
  css: { transformer: "lightningcss" },
  optimizeDeps: {
    include: [
      "@hookform/resolvers",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-menubar",
      "@radix-ui/react-navigation-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
      "@supabase/supabase-js",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "class-variance-authority",
      "clsx",
      "cmdk",
      "date-fns",
      "embla-carousel-react",
      "input-otp",
      "lucide-react",
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-dev-runtime",
      "react/jsx-runtime",
      "react-hook-form",
      "react-resizable-panels",
      "recharts",
      "sonner",
      "tailwind-merge",
      "vaul",
      "zod",
    ],
  },
  server: { host: "::", port: 8081 },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    nitro({ defaultPreset: "cloudflare-module" }),
    viteReact(),
  ],
});
