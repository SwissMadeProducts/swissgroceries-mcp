import { z } from 'zod';
import type { Chain } from './adapters/types.js';
export const CHAINS = ['migros','coop','aldi','denner','lidl','volgshop','ottos','coopcity'] as const;
export const chainSchema = z.enum(CHAINS);
export const retailerSelectionSchema = z.union([
  z.literal('all'),
  z.array(chainSchema).min(1).max(8),
]).describe('Required retailer selection: "all" searches all eight retailers, or provide one or more names, e.g. ["migros"] or ["migros","coop"]. Never omitted or inferred.');
export type RetailerSelection = z.infer<typeof retailerSelectionSchema>;
export function resolveChains(selection: RetailerSelection): Chain[] {
  const checked = retailerSelectionSchema.parse(selection);
  return checked === 'all' ? [...CHAINS] : [...new Set(checked)];
}
export const locationSchema = z.union([
  z.object({zip:z.string().regex(/^\d{4}$/).describe('Swiss ZIP code; resolved locally, e.g. 8001.')}).strict(),
  z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)}).strict(),
]).describe('Swiss ZIP or explicitly supplied coordinates. Free-text addresses and external geocoding are disabled.');
