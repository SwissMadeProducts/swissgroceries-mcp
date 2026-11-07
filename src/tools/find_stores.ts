import { retailerSelectionSchema, resolveChains, locationSchema } from '../selection.js';
import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { NormalizedStore } from '../adapters/types.js';
import { geocode } from '../services/geocoding.js';
import { ToolError } from './errors.js';

export const findStoresSchema = z.object({
  near: locationSchema,
  chains: retailerSelectionSchema,
  radiusKm: z.number().positive().max(50)
    .optional()
    .describe('Search radius in kilometers (1–50). Defaults to 5 km.'),
}).describe('Find grocery stores near a location, filtered by chain and radius. Returns store name, address, location, and hours.');

export type FindStoresInput = z.infer<typeof findStoresSchema>;

export async function findStoresHandler(
  registry: AdapterRegistry,
  input: FindStoresInput,
): Promise<NormalizedStore[]> {
  const geo = await geocode(input.near as any);
  if (!geo.ok) {
    const err = geo.error;
    if (err.code === 'unknown_zip') {
      throw new ToolError(
        'unknown_zip',
        `ZIP "${(err as any).zip}" is not in the lookup table`,
        'Pass { lat, lng } directly or check that the ZIP is a valid Swiss PLZ (e.g. "8001").',
      );
    }
    if (err.code === 'address_not_found') {
      throw new ToolError(
        'address_not_found',
        `Address "${(err as any).query}" could not be geocoded`,
        'Use a Swiss ZIP code or supplied coordinates.',
      );
    }
    if (err.code === 'unavailable') {
      throw new ToolError(
        'unavailable',
        (err as any).reason,
        'Use a Swiss ZIP or supplied coordinates. External geocoding is disabled.',
      );
    }
    throw new ToolError(
      err.code,
      'address_unsupported' in err ? (err as any).reason : err.code,
      'Pass a Swiss ZIP code or { lat, lng } coordinates instead of a free-text address.',
    );
  }

  const radius = input.radiusKm ?? 5;
  const adapters = registry.withCapability('storeSearch', resolveChains(input.chains));

  const results = await Promise.all(
    adapters.map(async (a) => {
      const r = await a.searchStores({
        near: { lat: geo.data.lat, lng: geo.data.lng },
        radiusKm: radius,
        cityHint: geo.data.city,
      });
      return r.ok ? r.data : [];
    }),
  );
  return results.flat();
}
