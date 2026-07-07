import type {
  Memory,
  MemoryCategory,
  MemorySource,
  PrismaClient,
} from "@prisma/client";

export interface MemorySearchHit {
  id: string;
  content: string;
  category: string;
  similarity: number;
}

export class MemoryRepository {
  constructor(private prisma: PrismaClient) {}

  create(
    userId: string,
    content: string,
    category: MemoryCategory,
    source: MemorySource,
  ): Promise<Memory> {
    return this.prisma.memory.create({
      data: { userId, content, category, source },
    });
  }

  listActive(userId: string, take = 50): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  findByContent(userId: string, query: string, take = 5): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      where: {
        userId,
        isActive: true,
        content: { contains: query, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.memory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Cosine-similarity search over pgvector embeddings (parameterized query). */
  vectorSearch(
    userId: string,
    vector: number[],
    take = 5,
  ): Promise<MemorySearchHit[]> {
    const literal = `[${vector.join(",")}]`;
    return this.prisma.$queryRawUnsafe<MemorySearchHit[]>(
      `SELECT id, content, category::text AS category,
              1 - (embedding <=> $1::vector) AS similarity
       FROM memories
       WHERE user_id = $2 AND is_active = true AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      literal,
      userId,
      take,
    );
  }

  async setEmbedding(id: string, vector: number[]): Promise<void> {
    const literal = `[${vector.join(",")}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE memories SET embedding = $1::vector WHERE id = $2`,
      literal,
      id,
    );
  }
}
