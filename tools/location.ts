import { Type } from "@google/genai";
import type { Location } from "@prisma/client";
import type { NovaTool, ToolContext } from "@/types";
import { str } from "@/tools/helpers";
import { logger, errorInfo } from "@/lib/logger";

const ACTIONS = ["add", "remove", "list", "set_default"];

// Nominatim doesn't always resolve a timezone (e.g. offshore points).
const DEFAULT_TIMEZONE = "Asia/Bangkok";

function view(location: Location) {
  return {
    name: location.name,
    country: location.country,
    timezone: location.timezone,
    latitude: location.latitude,
    longitude: location.longitude,
    isDefault: location.isDefault,
  };
}

export const locationTools: NovaTool[] = [
  {
    declaration: {
      name: "location",
      description:
        "Manage the user's saved locations (favorite places used by the weather/AQI tool). action=add saves a new place by name (geocoded via OpenStreetMap), action=remove deletes a saved place by name, action=list shows all saved places and which is default, action=set_default marks a saved place as the default. 'place' is required for add/remove/set_default.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            enum: ACTIONS,
            description: "Which operation to perform",
          },
          place: {
            type: Type.STRING,
            description:
              "Name of the place, exactly as the user said it (e.g. 'บ้าน', 'Sriwilai Resort', 'เชียงใหม่'). Required for add/remove/set_default, unused for list.",
          },
        },
        required: ["action"],
      },
    },
    async execute(args, ctx) {
      const action = str(args, "action");
      const place = str(args, "place");

      switch (action) {
        case "add":
          return addLocation(ctx, place);
        case "remove":
          return removeLocation(ctx, place);
        case "list":
          return listLocations(ctx);
        case "set_default":
          return setDefaultLocation(ctx, place);
        default:
          return { ok: false, status: "unknown_action", action };
      }
    },
  },
];

async function addLocation(
  ctx: ToolContext,
  place: string,
) {
  if (!place) return { ok: false, status: "missing_place" };

  let results;
  try {
    results = await ctx.services.geocoding.search(place);
  } catch (err) {
    logger.warn("location.geocode_failed", { ...errorInfo(err), place });
    return { ok: false, status: "geocoding_unavailable", query: place };
  }

  if (results.length === 0) {
    return { ok: false, status: "place_not_found", query: place };
  }
  if (results.length > 1) {
    return {
      ok: false,
      status: "ambiguous",
      query: place,
      candidates: results.map((r) => ({
        displayName: r.displayName,
        country: r.country,
      })),
    };
  }

  const match = results[0];
  const location = await ctx.services.location.create(ctx.user.id, {
    name: place,
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone ?? DEFAULT_TIMEZONE,
    country: match.country,
  });
  return { ok: true, action: "add", location: view(location) };
}

async function removeLocation(
  ctx: ToolContext,
  place: string,
) {
  if (!place) return { ok: false, status: "missing_place" };

  const matches = await ctx.services.location.findMatches(ctx.user.id, place);
  if (matches.length === 0) {
    return { ok: false, status: "location_not_found", query: place };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      status: "ambiguous",
      query: place,
      candidates: matches.map((m) => m.name),
    };
  }

  const [match] = matches;
  await ctx.services.location.delete(ctx.user.id, match.id);
  return { ok: true, action: "remove", location: view(match) };
}

async function listLocations(ctx: ToolContext) {
  const locations = await ctx.services.location.list(ctx.user.id);
  return {
    ok: true,
    action: "list",
    count: locations.length,
    locations: locations.map(view),
  };
}

async function setDefaultLocation(
  ctx: ToolContext,
  place: string,
) {
  if (!place) return { ok: false, status: "missing_place" };

  const matches = await ctx.services.location.findMatches(ctx.user.id, place);
  if (matches.length === 0) {
    return { ok: false, status: "location_not_found", query: place };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      status: "ambiguous",
      query: place,
      candidates: matches.map((m) => m.name),
    };
  }

  const [match] = matches;
  const updated = await ctx.services.location.update(ctx.user.id, match.id, {
    isDefault: true,
  });
  return { ok: true, action: "set_default", location: view(updated) };
}
