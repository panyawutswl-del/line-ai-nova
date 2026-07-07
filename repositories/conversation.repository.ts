import type { Conversation, MessageRole, Prisma, PrismaClient } from "@prisma/client";

export class ConversationRepository {
  constructor(private prisma: PrismaClient) {}

  append(
    userId: string,
    role: MessageRole,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: { userId, role, content, metadata },
    });
  }

  /** Most recent messages, returned oldest-first for prompt assembly. */
  async recent(userId: string, limit = 20): Promise<Conversation[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId, role: { in: ["USER", "ASSISTANT"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.reverse();
  }
}
