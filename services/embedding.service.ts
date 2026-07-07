import { GoogleGenAI } from "@google/genai";
import { logger, errorInfo } from "@/lib/logger";

const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768; // must match vector(768) in the migration

/**
 * Text embeddings for semantic memory search.
 * Returns null on any failure — callers fall back to keyword search,
 * so an embedding outage never blocks saving or finding memories.
 */
export class EmbeddingService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async embed(
    text: string,
    taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  ): Promise<number[] | null> {
    try {
      const res = await this.ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType,
          outputDimensionality: EMBEDDING_DIM,
          httpOptions: { timeout: 5_000 },
        },
      });
      const values = res.embeddings?.[0]?.values;
      return values && values.length === EMBEDDING_DIM ? values : null;
    } catch (err) {
      logger.warn("embedding.failed", { taskType, ...errorInfo(err) });
      return null;
    }
  }
}
