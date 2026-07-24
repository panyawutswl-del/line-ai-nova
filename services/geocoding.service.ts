import type { GeocodeResult, GeocodingProvider } from "@/services/geocoding/types";

export type { GeocodeResult, GeocodingProvider } from "@/services/geocoding/types";

/**
 * Provider-agnostic place search — swap `provider` (e.g. for Google Maps or
 * Mapbox) without touching callers like the `location` AI tool.
 */
export class GeocodingService {
  constructor(private provider: GeocodingProvider) {}

  search(query: string): Promise<GeocodeResult[]> {
    return this.provider.search(query);
  }
}
