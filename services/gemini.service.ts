import {
  GoogleGenAI,
  type Content,
  type GenerateContentResponse,
} from "@google/genai";
import { getToolDeclarations, executeTool } from "@/tools";
import { buildOfflineReply } from "@/services/offline-responder";
import type { ChatTurn, ToolContext } from "@/types";
import { logger, errorInfo } from "@/lib/logger";

const REQUEST_TIMEOUT_MS = 8_000; // LINE webhook must answer fast
const MAX_RETRIES = 2; // gemini-2.5-flash free tier throws intermittent 503
const MAX_TOOL_ROUNDS = 4;

const FALLBACK_REPLY =
  "ขออภัยค่ะ ตอนนี้ระบบขัดข้องชั่วคราว ลองพิมพ์อีกครั้งได้เลยนะคะ 🙏";

/** Shown when the Gemini quota is exhausted and no offline intent matched. */
const QUOTA_REPLY =
  "Nova ใช้งาน AI ครบโควต้าของวันนี้แล้ว กรุณาลองใหม่อีกครั้งในภายหลัง 🙏";

/** Thrown on HTTP 429 so the chat loop can switch to the offline responder. */
class GeminiQuotaError extends Error {}

function isQuotaError(message: string): boolean {
  return message.includes("429") || message.includes("RESOURCE_EXHAUSTED");
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Run a chat turn with function calling: keep executing requested tools
   * and feeding results back until the model returns plain text.
   */
  async chat(params: {
    history: ChatTurn[];
    systemInstruction: string;
    toolContext: ToolContext;
  }): Promise<string> {
    const contents: Content[] = params.history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    }));

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const response = await this.generateWithRetry(
          contents,
          params.systemInstruction,
        );
        if (!response) return FALLBACK_REPLY;

        const functionCalls = response.functionCalls ?? [];
        if (functionCalls.length === 0) {
          return response.text?.trim() || FALLBACK_REPLY;
        }

        // Echo the model's tool-call turn, then answer each call.
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);

        const responseParts = [];
        for (const call of functionCalls) {
          const result = await executeTool(
            call.name ?? "",
            (call.args ?? {}) as Record<string, unknown>,
            params.toolContext,
          );
          responseParts.push({
            functionResponse: { name: call.name, response: result },
          });
        }
        contents.push({ role: "user", parts: responseParts });
      }

      logger.warn("gemini.tool_loop_exhausted");
      return FALLBACK_REPLY;
    } catch (err) {
      if (err instanceof GeminiQuotaError) {
        return this.quotaFallback(params.history, params.toolContext);
      }
      throw err;
    }
  }

  /**
   * Gemini is out of quota — answer a few simple intents without the model,
   * else return the friendly quota message.
   */
  private async quotaFallback(
    history: ChatTurn[],
    toolContext: ToolContext,
  ): Promise<string> {
    const lastUser = [...history].reverse().find((h) => h.role === "user");
    const offline = lastUser
      ? await buildOfflineReply(lastUser.text, toolContext)
      : null;
    return offline ?? QUOTA_REPLY;
  }

  private async generateWithRetry(
    contents: Content[],
    systemInstruction: string,
  ): Promise<GenerateContentResponse | null> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.ai.models.generateContent({
          model: this.model,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: getToolDeclarations() }],
            abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Quota exhausted: retrying within the webhook window won't help, so
        // short-circuit to the offline responder immediately.
        if (isQuotaError(message)) {
          logger.error("gemini.quota_exceeded", { model: this.model });
          throw new GeminiQuotaError(message);
        }

        const retryable = message.includes("503");
        logger.warn("gemini.attempt_failed", {
          attempt,
          retryable,
          ...errorInfo(err),
        });
        if (!retryable || attempt === MAX_RETRIES) return null;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    return null;
  }
}
