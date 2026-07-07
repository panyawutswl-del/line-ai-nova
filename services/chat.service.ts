import type { User } from "@prisma/client";
import type { ConversationRepository } from "@/repositories/conversation.repository";
import type { GeminiService } from "@/services/gemini.service";
import { buildSystemPrompt } from "@/prompts/system";
import type { ChatTurn } from "@/types";

const HISTORY_LIMIT = 20;

export class ChatService {
  constructor(
    private conversations: ConversationRepository,
    private gemini: GeminiService,
  ) {}

  async reply(user: User, text: string): Promise<string> {
    await this.conversations.append(user.id, "USER", text);

    const rows = await this.conversations.recent(user.id, HISTORY_LIMIT);
    const history: ChatTurn[] = rows.map((row) => ({
      role: row.role === "USER" ? "user" : "model",
      text: row.content,
    }));

    const answer = await this.gemini.chat({
      history,
      systemInstruction: buildSystemPrompt(user),
      toolContext: { user },
    });

    await this.conversations.append(user.id, "ASSISTANT", answer);
    return answer;
  }
}
