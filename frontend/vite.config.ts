import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { compression } from "vite-plugin-compression2";
import path from "path";
import fs from "fs";

/**
 * Serves the .br / .gz files emitted at build time from `vite preview`.
 *
 * `vite preview` gzips on the fly but never negotiates brotli, so without
 * this the precompressed artifacts sit on disk unused and a local
 * Content-Encoding check cannot tell you what a real CDN would send.
 * Production hosting should do the same negotiation; this keeps preview
 * honest rather than flattering.
 */
function servePrecompressed(): Plugin {
  const encodings: { ext: string; header: string }[] = [
    { ext: ".br", header: "br" },
    { ext: ".gz", header: "gzip" },
  ];
  const types: Record<string, string> = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".svg": "image/svg+xml",
  };

  return {
    name: "serve-precompressed",
    configurePreviewServer(server) {
      const root = path.resolve(__dirname, "dist");
      // Unshifted rather than appended: Vite's own gzip middleware is already
      // in the stack and would otherwise answer first, hiding brotli.
      server.middlewares.stack.unshift({
        route: "",
        handle: (req: any, res: any, next: any) => {
          const accepted = String(req.headers["accept-encoding"] ?? "");
          const urlPath = (req.url ?? "").split("?")[0];
          const ext = path.extname(urlPath);
          if (!types[ext]) return next();

          for (const { ext: cext, header } of encodings) {
            if (!accepted.includes(header)) continue;
            const candidate = path.join(root, urlPath + cext);
            if (!candidate.startsWith(root) || !fs.existsSync(candidate)) continue;

            res.setHeader("Content-Encoding", header);
            res.setHeader("Content-Type", types[ext]);
            res.setHeader("Vary", "Accept-Encoding");
            res.setHeader("Content-Length", fs.statSync(candidate).size);
            fs.createReadStream(candidate).pipe(res);
            return;
          }
          next();
        },
      } as any);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    // Emit both, so a host that only understands gzip still gets a
    // precompressed file and does not have to compress per request.
    compression({ algorithms: ["brotliCompress"], exclude: [/\.(br|gz)$/] }),
    compression({ algorithms: ["gzip"], exclude: [/\.(br|gz)$/] }),
    servePrecompressed(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // No manualChunks: letting the bundler split per dynamic-import
    // boundary keeps route-specific dependencies (Leaflet, recharts,
    // pdfjs-dist, admin-only Radix dialogs) out of the eagerly-loaded
    // entry bundle. A manual vendor grouping was tried and made things
    // worse here — it forced those libraries into eagerly-fetched chunks.
  },
}));
