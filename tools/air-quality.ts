import { Type } from "@google/genai";
import type { Location } from "@prisma/client";
import type { NovaTool } from "@/types";
import { str } from "@/tools/helpers";

function locationView(location: Location) {
  return {
    name: location.name,
    country: location.country,
    timezone: location.timezone,
  };
}

export const airQualityTools: NovaTool[] = [
  {
    declaration: {
      name: "weather",
      description:
        "Get current weather and air quality (US AQI, PM2.5, PM10, main pollutant) for one of the user's saved locations. Omit 'location' to use their default saved location. Pass a name to match a saved location — matching is case-insensitive and partial (e.g. 'home', 'บ้าน', 'โรงแรม', 'เชียงใหม่'). Use this tool (not get_weather) for AQI / air quality / dust / pollution questions, and for anything referring to the user's own saved places (home, hotel, etc).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          location: {
            type: Type.STRING,
            description:
              "Optional: name or partial name of a saved location. Omit to use the user's default location.",
          },
        },
      },
    },
    async execute(args, ctx) {
      const query = str(args, "location");

      let location: Location;
      if (!query) {
        const found = await ctx.services.location.getDefault(ctx.user.id);
        if (!found) {
          return { ok: false, status: "no_default_location" };
        }
        location = found;
      } else {
        const matches = await ctx.services.location.findMatches(
          ctx.user.id,
          query,
        );
        if (matches.length === 0) {
          return { ok: false, status: "location_not_found", query };
        }
        if (matches.length > 1) {
          return {
            ok: false,
            status: "ambiguous",
            query,
            candidates: matches.map((m) => m.name),
          };
        }
        location = matches[0];
      }

      const result = await ctx.services.airvisual.current(
        location.latitude,
        location.longitude,
      );
      if (!result.ok) {
        return {
          ok: false,
          status: "airvisual_unavailable",
          reason: result.error,
          location: locationView(location),
        };
      }

      return {
        ok: true,
        location: locationView(location),
        weather: result.data.weather,
        airQuality: result.data.airQuality,
        metadata: result.data.metadata,
      };
    },
  },
];
