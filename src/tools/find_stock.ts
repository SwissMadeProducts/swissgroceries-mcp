import { locationSchema } from '../selection.js';
import { z } from 'zod';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StockResult } from '../adapters/types.js';
import { geocode } from '../services/geocoding.js';
import { ToolError } from './errors.js';

export const findStockSchema = z.object({
  chain: z.enum(['migros', 'coop', 'aldi', 'denner', 'lidl', 'volgshop', 'ottos', 'coopcity'])
    .describe('The chain to query for stock. Only chains with perStoreStock capability are supported.'),
  productId: z.string().min(1).max(200)
    .describe('Chain-specific product ID to check stock for. Obtain via search_products or get_product.'),
  near: locationSchema.optional(),
  storeId: z.string()
    .optional()
    .describe('Filter returned stock results to this store ID. The retailer API may still return multiple stores.'),
}).describe('Check which stores of a given chain have a specific product in stock. Useful for "is this item available near me?" queries. Not all chains support per-store stock; check capabilities first.');

export type FindStockInput = z.infer<typeof findStockSchema>;

export async function findStockHandler(
  registry: AdapterRegistry,
  input: FindStockInput,
): Promise<StockResult[]> {
  const adapter = registry.get(input.chain);
  if (!adapter) {
    throw new ToolError(
      'adapter_not_registered',
      `No adapter registered for chain "${input.chain}"`,
      'Ensure the chain is enabled in the server configuration. For Denner, set the DENNER_JWT env var.',
    );
  }
  if (!adapter.findStoresWithStock) {
    throw new ToolError(
      'capability_unsupported',
      `Adapter "${input.chain}" does not support per-store stock queries`,
      'Use search_products to find which chains carry this product, then try a chain that supports stock queries.',
    );
  }

  // Resolve {zip} / {address} / {lat,lng} to coordinates via the same
  // geocode() helper find_stores uses. Skip when no `near` was passed.
  let coords: { lat: number; lng: number } | undefined;
  if (input.near) {
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
        (err as any).code,
        'reason' in err ? (err as any).reason : (err as any).code,
        'Pass a Swiss ZIP code or { lat, lng } coordinates instead of a free-text address.',
      );
    }
    coords = { lat: geo.data.lat, lng: geo.data.lng };
  }

  const r = await adapter.findStoresWithStock(input.productId, coords);
  if (!r.ok) {
    throw new ToolError(
      r.error.code,
      `Stock query failed for ${input.chain}/${input.productId}: ${r.error.code}`,
      'Try again later or use search_products as a fallback.',
    );
  }
  return input.storeId ? r.data.filter(result=>result.store.id===input.storeId) : r.data;
}
