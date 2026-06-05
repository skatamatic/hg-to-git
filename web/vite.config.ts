import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(webRoot, "..");
const PORT_FILE = path.join(repoRoot, ".dev-api-port");

function devApiPort(): number {
  try {
    if (fs.existsSync(PORT_FILE)) {
      const n = Number(fs.readFileSync(PORT_FILE, "utf8").trim());
      if (n > 0) return n;
    }
  } catch {
    /* use default */
  }
  return Number(process.env.HG_TO_GIT_UI_PORT ?? 3847);
}

/** Proxy /api to the dev API port (read from .dev-api-port on each request). */
function apiProxyPlugin(): Plugin {
  return {
    name: "hg-to-git-api-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith("/api")) return next();

        const port = devApiPort();
        const proxyReq = http.request(
          {
            hostname: "127.0.0.1",
            port,
            path: url,
            method: req.method,
            headers: {
              ...req.headers,
              host: `127.0.0.1:${port}`,
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on("error", () => {
          if (res.writableEnded) return;
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: `API server not reachable on port ${port}. Wait for the [api] process in npm run dev:ui.`,
            }),
          );
        });

        req.pipe(proxyReq);
      });
    },
  };
}

const require = createRequire(path.join(webRoot, "package.json"));

/** Resolve deps from web/ or hoisted repo-root node_modules. */
function resolveDep(name: string): string {
  for (const root of [webRoot, repoRoot]) {
    const dir = path.join(root, "node_modules", name);
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  try {
    return path.dirname(require.resolve(name));
  } catch {
    return path.join(webRoot, "node_modules", name);
  }
}

const hoistedDeps = [
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "@radix-ui/react-progress",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-separator",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tooltip",
  "react",
  "react-dom",
];

export default defineConfig({
  base: process.env.VITE_RELATIVE_BASE === "1" ? "./" : "/",
  plugins: [react(), tailwindcss(), apiProxyPlugin()],
  resolve: {
    alias: Object.fromEntries(hoistedDeps.map((d) => [d, resolveDep(d)])),
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    fs: { allow: [webRoot, repoRoot] },
  },
  optimizeDeps: {
    include: hoistedDeps,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
