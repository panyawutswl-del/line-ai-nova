export interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
  country: string;
  /** IANA timezone name, e.g. "Asia/Bangkok" — null when it can't be determined. */
  timezone: string | null;
}

/** A place-search backend. Implement this to add a provider other than Nominatim. */
export interface GeocodingProvider {
  search(query: string): Promise<GeocodeResult[]>;
}
