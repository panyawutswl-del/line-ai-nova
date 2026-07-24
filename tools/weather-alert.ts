import { Type } from "@google/genai";
import type { ComparisonOperator, Location, WeatherAlert, WeatherAlertType } from "@prisma/client";
import type { NovaTool, ToolContext } from "@/types";
import { str } from "@/tools/helpers";

const ACTIONS = ["create", "delete", "list", "enable", "disable"];
// RAIN isn't exposed here — no forecast/precipitation source exists yet (see WeatherAlertService).
const TYPES: WeatherAlertType[] = ["AQI", "PM25", "TEMPERATURE", "WIND"];
const COMPARISONS = [">", ">=", "<", "<="] as const;

const COMPARISON_MAP: Record<(typeof COMPARISONS)[number], ComparisonOperator> = {
  ">": "GT",
  ">=": "GTE",
  "<": "LT",
  "<=": "LTE",
};
const COMPARISON_SYMBOL: Record<ComparisonOperator, string> = {
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
};

function view(alert: WeatherAlert, locationName: string) {
  return {
    id: alert.id,
    type: alert.type,
    comparison: alert.comparison ? COMPARISON_SYMBOL[alert.comparison] : null,
    threshold: alert.threshold,
    location: locationName,
    isEnabled: alert.isEnabled,
  };
}

type LocationResolution =
  | { ok: true; location: Location }
  | { ok: false; status: "no_default_location" }
  | { ok: false; status: "location_not_found"; query: string }
  | { ok: false; status: "ambiguous"; query: string; candidates: string[] };

async function resolveLocation(
  ctx: ToolContext,
  place: string,
): Promise<LocationResolution> {
  if (!place) {
    const found = await ctx.services.location.getDefault(ctx.user.id);
    return found ? { ok: true, location: found } : { ok: false, status: "no_default_location" };
  }
  const matches = await ctx.services.location.findMatches(ctx.user.id, place);
  if (matches.length === 0) return { ok: false, status: "location_not_found", query: place };
  if (matches.length > 1) {
    return {
      ok: false,
      status: "ambiguous",
      query: place,
      candidates: matches.map((m) => m.name),
    };
  }
  return { ok: true, location: matches[0] };
}

/** Find the single alert an action targets, either by alert_id or by (type, resolved location). */
async function resolveTargetAlert(
  ctx: ToolContext,
  alertId: string,
  type: string,
  place: string,
): Promise<
  | { ok: true; alert: WeatherAlert & { location: Location } }
  | { ok: false; result: Record<string, unknown> }
> {
  const alerts = await ctx.services.weatherAlert.list(ctx.user.id);

  if (alertId) {
    const match = alerts.find((a) => a.id === alertId);
    return match
      ? { ok: true, alert: match }
      : { ok: false, result: { ok: false, status: "alert_not_found", alert_id: alertId } };
  }

  if (!type || !TYPES.includes(type as WeatherAlertType)) {
    return { ok: false, result: { ok: false, status: "invalid_type", type } };
  }

  const resolved = await resolveLocation(ctx, place);
  if (!resolved.ok) return { ok: false, result: resolved };

  const candidates = alerts.filter(
    (a) => a.type === type && a.locationId === resolved.location.id,
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      result: { ok: false, status: "alert_not_found", type, location: resolved.location.name },
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      result: {
        ok: false,
        status: "ambiguous",
        candidates: candidates.map((a) => view(a, a.location.name)),
      },
    };
  }
  return { ok: true, alert: candidates[0] };
}

export const weatherAlertTools: NovaTool[] = [
  {
    declaration: {
      name: "weather_alert",
      description:
        "Set up, list, or toggle standing weather/AQI alerts that notify automatically via LINE the moment a condition becomes true (no fixed time — unlike create_reminder). ALWAYS call this tool for any request to be notified/alerted based on a weather or air-quality threshold — never reply that this can't be done automatically. Trigger phrases include: 'แจ้งเมื่อ AQI เกิน 100', 'แจ้งเมื่อ PM2.5 เกิน 35', 'แจ้งเตือนถ้าฝุ่นเกิน 50', 'แจ้งเมื่ออุณหภูมิสูงกว่า 38', 'บอกฉันถ้าลมแรงเกิน 10', 'notify me when AQI is above 100', 'alert me if PM2.5 exceeds 35' (all → action=create); 'ปิดการแจ้งเตือน AQI', 'หยุดแจ้งเตือนฝุ่น' (→ action=disable); 'เปิดการแจ้งเตือนอุณหภูมิ' (→ action=enable); 'ลบการแจ้งเตือน AQI' (→ action=delete); 'แสดงการแจ้งเตือนของฉัน', 'มีการแจ้งเตือนอะไรบ้าง', 'list my alerts' (→ action=list). action=create requires type + comparison + threshold (RAIN alerts aren't supported yet). For delete/enable/disable, identify the alert either by alert_id (if you already have it from a list call) or by type + location.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ACTIONS, description: "Which operation to perform" },
          type: {
            type: Type.STRING,
            enum: TYPES,
            description:
              "Metric to watch: AQI (US AQI), PM25 (PM2.5 µg/m³), TEMPERATURE (°C), WIND (m/s). Required for create; required for delete/enable/disable unless alert_id is given.",
          },
          comparison: {
            type: Type.STRING,
            enum: [...COMPARISONS],
            description:
              "Comparison operator for the threshold, e.g. '>' for 'เกิน/สูงกว่า', '<' for 'ต่ำกว่า'. Required for create.",
          },
          threshold: {
            type: Type.NUMBER,
            description: "The numeric threshold to compare against. Required for create.",
          },
          location: {
            type: Type.STRING,
            description:
              "Name of a saved location (partial, case-insensitive match). Omit to use the user's default location.",
          },
          alert_id: {
            type: Type.STRING,
            description:
              "Optional: exact alert id from a previous list call. When given for delete/enable/disable, type and location are not needed.",
          },
        },
        required: ["action"],
      },
    },
    async execute(args, ctx) {
      const action = str(args, "action");
      const type = str(args, "type");
      const comparisonSymbol = str(args, "comparison");
      const thresholdRaw = args["threshold"];
      const threshold = typeof thresholdRaw === "number" ? thresholdRaw : undefined;
      const place = str(args, "location");
      const alertId = str(args, "alert_id");

      switch (action) {
        case "create": {
          if (!type || !TYPES.includes(type as WeatherAlertType)) {
            return { ok: false, status: "invalid_type", type };
          }
          if (!COMPARISONS.includes(comparisonSymbol as (typeof COMPARISONS)[number])) {
            return { ok: false, status: "invalid_comparison", comparison: comparisonSymbol };
          }
          if (threshold === undefined || Number.isNaN(threshold)) {
            return { ok: false, status: "missing_threshold" };
          }

          const resolved = await resolveLocation(ctx, place);
          if (!resolved.ok) return resolved;

          const alert = await ctx.services.weatherAlert.create(ctx.user.id, {
            locationId: resolved.location.id,
            type: type as WeatherAlertType,
            comparison: COMPARISON_MAP[comparisonSymbol as (typeof COMPARISONS)[number]],
            threshold,
          });
          return { ok: true, action: "create", alert: view(alert, resolved.location.name) };
        }

        case "list": {
          const alerts = await ctx.services.weatherAlert.list(ctx.user.id);
          return {
            ok: true,
            action: "list",
            count: alerts.length,
            alerts: alerts.map((a) => view(a, a.location.name)),
          };
        }

        case "delete": {
          const target = await resolveTargetAlert(ctx, alertId, type, place);
          if (!target.ok) return target.result;
          await ctx.services.weatherAlert.delete(ctx.user.id, target.alert.id);
          return { ok: true, action: "delete", alert: view(target.alert, target.alert.location.name) };
        }

        case "enable":
        case "disable": {
          const target = await resolveTargetAlert(ctx, alertId, type, place);
          if (!target.ok) return target.result;
          const updated = await ctx.services.weatherAlert.setEnabled(
            ctx.user.id,
            target.alert.id,
            action === "enable",
          );
          return { ok: true, action, alert: view(updated, target.alert.location.name) };
        }

        default:
          return { ok: false, status: "unknown_action", action };
      }
    },
  },
];
