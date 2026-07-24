import tzLookup from "tz-lookup";
import type { GeocodeResult, GeocodingProvider } from "@/services/geocoding/types";

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const TIMEOUT_MS = 8_000;
// Nominatim's usage policy requires an identifying User-Agent.
const USER_AGENT =
  "NovaAI-LineBot/1.0 (+https://github.com/panyawutswl-del/line-ai-nova)";

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: { country?: string };
}

/** OpenStreetMap Nominatim — free, no API key, rate-limited to ~1 req/s. */
export class NominatimProvider implements GeocodingProvider {
  async search(query: string): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      limit: "5",
    });

    const res = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "th,en" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Nominatim request failed: HTTP ${res.status}`);
    }

    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error("Nominatim response was not an array");
    }

    return (body as NominatimResult[])
      .map((raw) => this.normalize(raw))
      .filter((r): r is GeocodeResult => r !== null);
  }

  private normalize(raw: NominatimResult): GeocodeResult | null {
    const latitude = Number(raw.lat);
    const longitude = Number(raw.lon);
    if (!raw.display_name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    const country =
      raw.address?.country ?? raw.display_name.split(",").pop()?.trim() ?? "";

    return {
      displayName: raw.display_name,
      latitude,
      longitude,
      country,
      timezone: this.lookupTimezone(latitude, longitude),
    };
  }

  private lookupTimezone(latitude: number, longitude: number): string | null {
    try {
      return tzLookup(latitude, longitude);
    } catch {
      return null;
    }
  }
}
