import { TmsRateResponse } from '../types/tms';

interface CacheEntry {
  response: TmsRateResponse;
  expiresAt: number;
}

// In-memory rate cache keyed by origin ZIP + destination ZIP + total grams.
// Sufficient for a single-instance deployment. Upgrade to Redis if running
// multiple instances or if persistence across restarts is required.
export class RateCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  private key(originZip: string, destZip: string, totalGrams: number): string {
    return `${originZip}:${destZip}:${totalGrams}`;
  }

  get(originZip: string, destZip: string, totalGrams: number): TmsRateResponse | null {
    const entry = this.store.get(this.key(originZip, destZip, totalGrams));
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.key(originZip, destZip, totalGrams));
      return null;
    }
    return entry.response;
  }

  set(originZip: string, destZip: string, totalGrams: number, response: TmsRateResponse): void {
    this.store.set(this.key(originZip, destZip, totalGrams), {
      response,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}
