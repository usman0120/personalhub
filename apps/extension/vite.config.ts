import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const HUB_ORIGIN = (process.env.HUB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");

/** Writes manifest.json with host_permissions set to the hub origin. */
function manifest(): Plugin {
  return {
    name: "personalhub-manifest",
    closeBundle() {
      const tpl = JSON.parse(readFileSync(resolve(__dirname, "manifest.json"), "utf8"));
      tpl.host_permissions = [`${HUB_ORIGIN}/*`];
      mkdirSync(resolve(__dirname, "dist"), { recursive: true });
      writeFileSync(resolve(__dirname, "dist/manifest.json"), JSON.stringify(tpl, null, 2));
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, "src"),
  publicDir: resolve(__dirname, "public"),
  define: { __HUB_ORIGIN__: JSON.stringify(HUB_ORIGIN) },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "chrome120",
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.html"),
        options: resolve(__dirname, "src/options.html"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: { entryFileNames: (c) => (c.name === "background" ? "background.js" : "assets/[name]-[hash].js") },
    },
  },
  plugins: [manifest()],
});
