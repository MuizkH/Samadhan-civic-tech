/**
 * Resolves which municipal jurisdiction a coordinate falls in.
 *
 * City is an authorization boundary — it decides which department admins can
 * see and act on an issue — so it is derived server-side from the reported
 * coordinates rather than read off the request body. The client's address
 * string is a free-form Nominatim `display_name` ("MP Nagar, Bhopal, Bhopal
 * District, Madhya Pradesh, 462011, India"), which is neither stable enough to
 * parse nor safe to trust for a permission decision.
 *
 * Nearest-centroid rather than a live reverse-geocode lookup: putting a
 * third-party HTTP call on the issue-creation path would mean an outage or a
 * rate-limit produces issues with no city, and an issue with no city is
 * invisible to every department admin. This is deterministic and offline.
 *
 * The trade-off is precision at the boundary — a point midway between two
 * cities is assigned to whichever centroid is closer, not to the true
 * municipal limit. Adequate while jurisdictions are this far apart; if
 * adjacent municipalities are ever onboarded this needs real boundary
 * polygons (PostGIS ST_Contains against a `city_boundaries` table).
 */

interface CityCentroid {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Municipalities the platform is deployed in. Kept here rather than in the
 * database because it is deployment configuration, not operational data, and
 * the scoping logic must work before any row exists.
 */
const CITY_CENTROIDS: CityCentroid[] = [
  { name: "Bhopal", lat: 23.2599, lng: 77.4126 },
  { name: "Indore", lat: 22.7196, lng: 75.8577 },
  { name: "Jabalpur", lat: 23.1815, lng: 79.9864 },
  { name: "Gwalior", lat: 26.2183, lng: 78.1828 },
  { name: "Ujjain", lat: 23.1793, lng: 75.7849 },
];

/**
 * Beyond this distance from every known centroid a point is treated as outside
 * all serviced jurisdictions and gets no city.
 *
 * Such an issue is deliberately visible only to super_admin, who can reassign
 * it — the alternative, attaching it to the nearest city however far away,
 * would drop rural reports into an unrelated municipality's queue.
 */
const MAX_CITY_RADIUS_KM = 60;

const EARTH_RADIUS_KM = 6371;
const toRadians = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The serviced city containing this point, or null if none is within range. */
export function cityFromLocation(latitude: number, longitude: number): string | null {
  let best: { name: string; distanceKm: number } | null = null;
  for (const city of CITY_CENTROIDS) {
    const distanceKm = haversineKm(latitude, longitude, city.lat, city.lng);
    if (!best || distanceKm < best.distanceKm) best = { name: city.name, distanceKm };
  }
  if (!best || best.distanceKm > MAX_CITY_RADIUS_KM) return null;
  return best.name;
}
