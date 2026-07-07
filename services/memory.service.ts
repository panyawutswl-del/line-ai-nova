import type { Memory, MemoryCategory, MemorySource } from "@prisma/client";
import type {
  MemoryRepository,
  MemorySearchHit,
} from "@/repositories/memory.repository";
import type { EmbeddingService } from "@/services/embedding.service";
import { logger, errorInfo } from "@/lib/logger";

const MIN_SIMILARITY = 0.5;

export class MemoryService {
  constructor(
    private memories: MemoryRepository,
    private embeddings: EmbeddingService,
  ) {}

  async save(
    userId: string,
    content: string,
    category: MemoryCategory,
    source: MemorySource,
  ): Promise<Memory> {
    const memory = await this.memories.create(userId, content, category, source);
    // Embedding is best-effort; the row is already saved.
    const vector = await this.embeddings.embed(content, "RETRIEVAL_DOCUMENT");
    if (vector) {
      await this.memories
        .setEmbedding(memory.id, vector)
        .catch((err) => logger.warn("memory.embed_store_failed", errorInfo(err)));
    }
    return memory;
  }

  /** Semantic (pgvector) search merged with keyword matches. */
  async search(
    userId: string,
    query: string,
    take = 5,
  ): Promise<MemorySearchHit[]> {
    const results = new Map<string, MemorySearchHit>();

    const vector = await this.embeddings.embed(query, "RETRIEVAL_QUERY");
    if (vector) {
      const hits = await this.memories
        .vectorSearch(userId, vector, take)
        .catch((err) => {
          logger.warn("memory.vector_search_failed", errorInfo(err));
          return [] as MemorySearchHit[];
        });
      for (const hit of hits) {
        if (hit.similarity >= MIN_SIMILARITY) results.set(hit.id, hit);
      }
    }

    const keywordHits = await this.memories.findByContent(userId, query, take);
    for (const m of keywordHits) {
      if (!results.has(m.id)) {
        results.set(m.id, {
          id: m.id,
          content: m.content,
          category: m.category,
          similarity: 1,
        });
      }
    }

    return [...results.values()].slice(0, take);
  }

  /** Soft-delete the best match; returns the forgotten content or null. */
  async forget(userId: string, query: string): Promise<string | null> {
    const hits = await this.search(userId, query, 1);
    if (hits.length === 0) return null;
    await this.memories.deactivate(hits[0].id);
    return hits[0].content;
  }

  list(userId: string, take = 50): Promise<Memory[]> {
    return this.memories.listActive(userId, take);
  }
}
