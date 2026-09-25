import { useEffect } from "react";

/**
 * Per-page document metadata for the two crawlable routes.
 *
 * Deliberately tiny and dependency-free: only `/` and `/transparency` are
 * reachable without signing in, so a full head-management library would be
 * carried by every route to serve two of them. Tags are written on mount and
 * restored on unmount so a client-side navigation cannot leave the previous
 * page's description behind.
 */

const SITE_URL = "https://samadhan.gov.in";

export interface PageMetaProps {
  title: string;
  description: string;
  /** Path only, e.g. "/transparency". Combined with the canonical origin. */
  path: string;
  /** Absolute or root-relative preview image for OG / Twitter cards. */
  image?: string;
  /** JSON-LD object rendered into a script tag. */
  jsonLd?: Record<string, unknown>;
}

function upsertMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

export function PageMeta({ title, description, path, image = "/og-image.png", jsonLd }: PageMetaProps) {
  useEffect(() => {
    const previousTitle = document.title;
    const url = `${SITE_URL}${path}`;
    const absoluteImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;

    document.title = title;

    upsertMeta('meta[name="description"]', "name", "description", description);
    upsertMeta('meta[property="og:title"]', "property", "og:title", title);
    upsertMeta('meta[property="og:description"]', "property", "og:description", description);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[property="og:image"]', "property", "og:image", absoluteImage);
    upsertMeta('meta[property="og:type"]', "property", "og:type", "website");
    upsertMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    upsertMeta('meta[name="twitter:image"]', "name", "twitter:image", absoluteImage);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      document.title = previousTitle;
      script?.remove();
    };
  }, [title, description, path, image, jsonLd]);

  return null;
}
