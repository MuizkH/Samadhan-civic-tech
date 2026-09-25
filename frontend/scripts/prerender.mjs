/**
 * Prerenders the public routes to static HTML after a build.
 *
 * Only `/` and `/transparency` are reachable without signing in; everything
 * else is behind auth and would prerender to a redirect or an empty shell, so
 * it is deliberately excluded (and disallowed in robots.txt).
 *
 * Uses the locally installed Chrome via puppeteer-core rather than bundling a
 * Chromium download, and serves the real `dist/` output so what gets captured
 * is exactly what ships.
 *
 *   node scripts/prerender.mjs            # after `vite build`
 *   PRERENDER_CHROME=<path> node ...      # override the browser binary
 */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");
const ROUTES = ["/", "/transparency"];
const PORT = 4178;

const CHROME_CANDIDATES = [
  process.env.PRERENDER_CHROME,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    return null;
  }
  return found;
}

/**
 * Minimal static server with SPA fallback, so client routing resolves.
 *
 * The fallback serves the pristine shell captured before any route was
 * written. Serving `dist/index.html` from disk instead would mean that once
 * `/` has been prerendered, every later route boots from *that* output —
 * inheriting the landing page's rendered markup and its JSON-LD.
 */
function serveDist(shell) {
  return createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const filePath = path.join(DIST, urlPath);
    const isFile = filePath.startsWith(DIST) && !urlPath.endsWith("/") && existsSync(filePath);

    if (!isFile) {
      res.setHeader("Content-Type", "text/html");
      res.end(shell);
      return;
    }
    try {
      const body = await readFile(filePath);
      res.setHeader("Content-Type", MIME[path.extname(filePath)] ?? "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });
}

const shell = await readFile(path.join(DIST, "index.html"), "utf8");
const server = serveDist(shell);
await new Promise((resolve) => server.listen(PORT, resolve));

const chromePath = findChrome();
if (!chromePath) {
  console.warn(
    "WARNING: No Chrome binary found. Skipping prerender phase. The app will build as a standard client-side SPA."
  );
  server.close();
  process.exit(0);
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

let failed = 0;
try {
  for (const route of ROUTES) {
    const page = await browser.newPage();
    try {
      await page.goto(`http://localhost:${PORT}${route}`, {
        waitUntil: "networkidle0",
        timeout: 45_000,
      });
      // The shell renders instantly; wait for React to have painted something.
      await page.waitForFunction(
        () => (document.querySelector("#root")?.textContent ?? "").trim().length > 100,
        { timeout: 20_000 }
      );

      let html = await page.content();

      // Keep the resolved <head>, drop the rendered body.
      //
      // The app mounts with createRoot, not hydrateRoot, so React discards
      // whatever markup is already in #root and renders from scratch. Shipping
      // the rendered DOM therefore costs a larger document to download and
      // parse for markup that is immediately thrown away — measured at
      // Lighthouse performance 88 -> 68 on /transparency. The SEO value lives
      // in the head (title, description, canonical, OG/Twitter, JSON-LD),
      // which is what social unfurlers read and what JS-executing crawlers
      // confirm, so that is what we keep.
      const rootOpen = '<div id="root">';
      const start = html.indexOf(rootOpen);
      const bodyEnd = html.lastIndexOf("</body>");
      if (start !== -1 && bodyEnd > start) {
        const closeIdx = html.lastIndexOf("</div>", bodyEnd);
        if (closeIdx > start) {
          html = html.slice(0, start + rootOpen.length) + html.slice(closeIdx);
        }
      }
      const outDir = route === "/" ? DIST : path.join(DIST, route.replace(/^\//, ""));
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "index.html"), html, "utf8");
      console.log(
        `prerendered ${route} -> ${path.relative(DIST, path.join(outDir, "index.html"))} (${Math.round(html.length / 1024)} KB)`
      );
    } catch (err) {
      failed++;
      console.error(`FAILED to prerender ${route}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

// A silent prerender failure would ship an empty shell to crawlers while the
// build still looks green, so make it loud.
if (failed > 0) process.exit(1);
