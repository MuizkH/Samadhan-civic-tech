/**
 * The subset of an OpenStreetMap Nominatim search result this app reads.
 *
 * Nominatim returns lat/lon as strings, which is exactly the kind of detail a
 * cast to `any` used to hide — every call site then had to remember to
 * parseFloat. Typing it makes that conversion visible.
 */
export interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}
