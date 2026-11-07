import zipsRaw from '../data/swiss-zips.json' with { type: 'json' };
import type { GeoPoint } from '../adapters/types.js';
import { haversineKm } from '../util/haversine.js';

type ZipEntry = { city: string; lat: number; lng: number };
const zips = zipsRaw as Record<string, ZipEntry>;

export type GeocodeInput =
  | { lat: number; lng: number }
  | { zip: string }
  | { address: string };

export type GeocodeError =
  | { code: 'unknown_zip'; zip: string }
  | { code: 'address_not_found'; query: string }
  | { code: 'unavailable'; reason: string }
  | { code: 'address_unsupported'; reason: string };  // Legacy address input is rejected without external requests.

export type GeocodeResult =
  | { ok: true; data: GeoPoint & { city?: string } }
  | { ok: false; error: GeocodeError };

/**
 * Swiss ZIPs whose centroid lies within `radiusKm` of `point`, nearest first,
 * capped at `max`. The single nearest ZIP is always included (even when it is
 * outside the radius) so a point between centroids still resolves to its
 * postcode. Returns [] only when the table is empty. Used by adapters whose
 * store search is text-ranked and works best with a PLZ query (e.g. Migros).
 */
export function nearbyZips(point: GeoPoint, radiusKm: number, max: number): string[] {
  const ranked = Object.entries(zips)
    .map(([zip, e]) => ({ zip, d: haversineKm(point, e) }))
    .sort((a, b) => a.d - b.d);
  if (ranked.length === 0) return [];
  const within = ranked.filter((r, i) => i === 0 || r.d <= radiusKm);
  return within.slice(0, max).map((r) => r.zip);
}

export async function geocode(input: GeocodeInput): Promise<GeocodeResult> {
  if ('lat' in input) {
    return { ok: true, data: { lat: input.lat, lng: input.lng } };
  }
  if ('zip' in input) {
    const entry = zips[input.zip];
    if (!entry) return { ok: false, error: { code: 'unknown_zip', zip: input.zip } };
    return { ok: true, data: { lat: entry.lat, lng: entry.lng, city: entry.city } };
  }
  return {ok:false,error:{code:'address_unsupported',reason:'External address geocoding is disabled. Use a Swiss ZIP or supplied coordinates.'}};
}
