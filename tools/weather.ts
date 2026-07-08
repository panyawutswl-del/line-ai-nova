import { Type } from "@google/genai";
import type { NovaTool } from "@/types";
import { str } from "@/tools/helpers";

export const weatherTools: NovaTool[] = [
  {
    declaration: {
      name: "get_weather",
      description:
        "Get current weather conditions (temperature, high/low, condition, rain chance). Omit 'city' for the default location (Sukhothai resort); pass any city name (e.g. 'Bangkok', 'ฮ่องกง', 'Tokyo') to check weather elsewhere.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          city: {
            type: Type.STRING,
            description: "City name to check, in any language. Omit for the default location.",
          },
        },
      },
    },
    async execute(args, ctx) {
      const city = str(args, "city");
      const snapshot = city
        ? await ctx.services.weather.forCity(city)
        : await ctx.services.weather.current();
      if (!snapshot) {
        return {
          ok: false,
          message: city
            ? `หาข้อมูลอากาศของ "${city}" ไม่ได้ค่ะ`
            : "ดึงข้อมูลอากาศไม่สำเร็จค่ะ",
        };
      }
      return {
        ok: true,
        location: snapshot.locationName,
        temperature_c: snapshot.temperature,
        high_c: snapshot.high,
        low_c: snapshot.low,
        condition: snapshot.condition,
        rain_probability_percent: snapshot.rainProbability,
      };
    },
  },
];
