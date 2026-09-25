/**
 * Cloudinary delivery URLs.
 *
 * Uploads go to Cloudinary unconstrained, so the stored URL points at the
 * original camera file — potentially several megabytes. Every render site
 * must go through here rather than dropping the raw URL into `src`, so the
 * size actually sent is tied to the size actually displayed.
 *
 * Anything that is not a Cloudinary delivery URL (local seed assets, blob
 * previews, data URIs) is returned untouched.
 */

/** Presets matched to where the image is rendered. */
export const IMAGE_PRESETS = {
  /** Feed / grid card thumbnail. */
  thumbnail: "f_auto,q_auto,w_400,dpr_auto",
  /** Full-width image in the issue detail dialog. */
  detail: "f_auto,q_auto,w_1200,dpr_auto",
  /** Tiny preview inside a Leaflet marker popup. */
  mapPopup: "f_auto,q_auto,w_200,dpr_auto",
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS;

/** Intrinsic dimensions to set on the <img>, so the box is reserved before load. */
export const IMAGE_DIMENSIONS: Record<ImagePreset, { width: number; height: number }> = {
  thumbnail: { width: 400, height: 225 },
  detail: { width: 1200, height: 675 },
  mapPopup: { width: 200, height: 120 },
};

const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload)\/(.*)$/;

/**
 * Inserts a transformation segment into a Cloudinary URL.
 *
 * Cloudinary URLs look like
 *   https://res.cloudinary.com/<cloud>/image/upload[/<transforms>]/v123/path.jpg
 * so the transform slots directly after `/upload`. If a transformation is
 * already present we leave the URL alone rather than stacking a second one,
 * which would silently re-scale an already-scaled asset.
 */
export function imageUrl(src: string | null | undefined, preset: ImagePreset): string {
  if (!src) return "";

  const match = src.match(CLOUDINARY_UPLOAD);
  if (!match) return src;

  const [, base, rest] = match;

  // A leading segment containing transformation syntax means this URL was
  // already built for a specific size.
  const firstSegment = rest.split("/")[0] ?? "";
  const alreadyTransformed = /(^|,)(f_|q_|w_|h_|c_|dpr_)/.test(firstSegment);
  if (alreadyTransformed) return src;

  return `${base}/${IMAGE_PRESETS[preset]}/${rest}`;
}

/**
 * Props to spread onto an `<img>`: transformed src, intrinsic width/height to
 * prevent layout shift, and native lazy loading for anything below the fold.
 */
export function imageProps(
  src: string | null | undefined,
  preset: ImagePreset,
  opts: { eager?: boolean } = {}
) {
  return {
    src: imageUrl(src, preset),
    width: IMAGE_DIMENSIONS[preset].width,
    height: IMAGE_DIMENSIONS[preset].height,
    loading: (opts.eager ? "eager" : "lazy") as "eager" | "lazy",
    decoding: "async" as const,
  };
}
