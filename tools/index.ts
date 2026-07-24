import type { FunctionDeclaration } from "@google/genai";
import type { NovaTool, ToolContext } from "@/types";
import { logger, errorInfo } from "@/lib/logger";
import { getCurrentDatetimeTool } from "@/tools/get-current-datetime";
import { memoryTools } from "@/tools/memory";
import { todoTools } from "@/tools/todo";
import { reminderTools } from "@/tools/reminder";
import { calendarTools } from "@/tools/calendar";
import { newsTools } from "@/tools/news";
import { weatherTools } from "@/tools/weather";
import { airQualityTools } from "@/tools/air-quality";

const tools: NovaTool[] = [
  getCurrentDatetimeTool,
  ...memoryTools,
  ...todoTools,
  ...reminderTools,
  ...calendarTools,
  ...newsTools,
  ...weatherTools,
  ...airQualityTools,
];

const registry = new Map<string, NovaTool>(
  tools.map((t) => [t.declaration.name!, t]),
);

export function getToolDeclarations(): FunctionDeclaration[] {
  return tools.map((t) => t.declaration);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const tool = registry.get(name);
  if (!tool) {
    logger.warn("tool.unknown", { name });
    return { error: `Unknown tool: ${name}` };
  }
  try {
    const result = await tool.execute(args, ctx);
    logger.info("tool.executed", { name, userId: ctx.user.id });
    return result;
  } catch (err) {
    logger.error("tool.failed", { name, ...errorInfo(err) });
    return { error: `Tool ${name} failed` };
  }
}
