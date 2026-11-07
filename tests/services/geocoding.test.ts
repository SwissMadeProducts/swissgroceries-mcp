import { describe, it, expect, beforeEach, vi } from 'vitest';
import { geocode, nearbyZips } from '../../src/services/geocoding.js';
import { _resetHttpState } from '../../src/util/http.js';

beforeEach(() => {
  _resetHttpState();
  vi.restoreAllMocks();
});

describe('geocode', () => {
  it('resolves a known ZIP to lat/lng', async () => {
    const r = await geocode({ zip: '8001' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.lat).toBeCloseTo(47.37, 1);
      expect(r.data.lng).toBeCloseTo(8.54, 1);
    }
  });

  it('returns error for unknown ZIP', async () => {
    const r = await geocode({ zip: '9999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown_zip');
  });

  it('passes through lat/lng inputs unchanged', async () => {
    const r = await geocode({ lat: 47.0, lng: 8.0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual({ lat: 47.0, lng: 8.0 });
  });

  it('rejects addresses without sending any network request', async () => {
    const fetchSpy=vi.spyOn(global,'fetch');
    const r=await geocode({address:'Synthetic Street 1'});
    expect(r.ok).toBe(false);
    if(!r.ok)expect(r.error.code).toBe('address_unsupported');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('nearbyZips', () => {
  it('returns central Zürich ZIPs nearest first for Zürich HB coordinates', () => {
    const zips = nearbyZips({ lat: 47.3779, lng: 8.5403 }, 1, 6);
    expect(zips.length).toBeGreaterThan(0);
    expect(zips.length).toBeLessThanOrEqual(6);
    expect(zips[0]).toMatch(/^80\d\d$/);
  });

  it('always includes the nearest ZIP even when none is within the radius', () => {
    expect(nearbyZips({ lat: 47.3779, lng: 8.5403 }, 0, 6)).toHaveLength(1);
  });

  it('respects the max cap', () => {
    expect(nearbyZips({ lat: 47.3779, lng: 8.5403 }, 20, 3)).toHaveLength(3);
  });
});
