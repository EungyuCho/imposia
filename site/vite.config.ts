import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import mdx from "fumadocs-mdx/vite";
import { defineConfig, type Plugin } from "vite";

const siteRoot = fileURLToPath(new URL(".", import.meta.url));
const demoRoot = fileURLToPath(new URL("../examples/demo/", import.meta.url));

const demoAssets = new Map<string, string>([
  ["app.js", "text/javascript; charset=utf-8"],
  ["index.html", "text/html; charset=utf-8"],
  ["styles.css", "text/css; charset=utf-8"],
  ["viewer.css", "text/css; charset=utf-8"],
]);

function serveDemo(): Plugin {
  return {
    name: "imposia-demo-assets",
    configureServer(server) {
      server.middlewares.use("/examples/demo", async (request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const asset = pathname === "/" ? "index.html" : pathname.slice(1);
        const contentType = demoAssets.get(asset);
        if (!contentType) {
          next();
          return;
        }

        try {
          response.setHeader("Content-Type", contentType);
          response.end(await readFile(`${demoRoot}${asset}`));
        } catch (error) {
          next(error as Error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    serveDemo(),
    tailwindcss(),
    mdx(undefined, {
      configPath: "source.config.ts",
      outDir: ".source",
    }),
    reactRouter(),
  ],
  resolve: {
    alias: {
      "@": siteRoot,
      collections: `${siteRoot}.source`,
    },
  },
  ssr: {
    noExternal: ["fumadocs-core", "fumadocs-mdx", "fumadocs-ui"],
  },
});
