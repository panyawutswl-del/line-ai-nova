import type { User } from "@prisma/client";
import type { ConversationRepository } from "@/repositories/conversation.repository";
import type { GeminiService } from "@/services/gemini.service";
import type { MemoryService } from "@/services/memory.service";
import { buildSystemPrompt } from "@/prompts/system";
import type { ChatTurn, ToolServices } from "@/types";

const HISTORY_LIMIT = 20;
const MEMORY_CONTEXT_LIMIT = 30;

export class ChatService {
  constructor(
    private conversations: ConversationRepository,
    private gemini: GeminiService,
    private memory: MemoryService,
    private toolServices: ToolServices,
  ) {}

  async reply(user: User, text: string): Promise<string> {
    await this.conversations.append(user.id, "USER", text);

    const [rows, memories] = await Promise.all([
      this.conversations.recent(user.id, HISTORY_LIMIT),
      this.memory.list(user.id, MEMORY_CONTEXT_LIMIT),
    ]);
    const history: ChatTurn[] = rows.map((row) => ({
      role: row.role === "USER" ? "user" : "model",
      text: row.content,
    }));

    const answer = await this.gemini.chat({
      history,
      systemInstruction: buildSystemPrompt(user, memories),
      toolContext: { user, services: this.toolServices },
    });

    await this.conversations.append(user.id, "ASSISTANT", answer);
    return answer;
  }
}
