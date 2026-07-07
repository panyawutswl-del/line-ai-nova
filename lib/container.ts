import { getConfig } from "@/lib/config";
import { getPrisma } from "@/lib/prisma";
import { LineService } from "@/lib/line";
import { UserRepository } from "@/repositories/user.repository";
import { ConversationRepository } from "@/repositories/conversation.repository";
import { GeminiService } from "@/services/gemini.service";
import { UserService } from "@/services/user.service";
import { ChatService } from "@/services/chat.service";
import { WebhookService } from "@/services/webhook.service";

/**
 * Composition root — wires repositories and services once per runtime.
 * Everything downstream receives dependencies via constructor injection.
 */
export interface Container {
  line: LineService;
  userService: UserService;
  chatService: ChatService;
  webhookService: WebhookService;
}

let container: Container | null = null;

export function getContainer(): Container {
  if (container) return container;

  const config = getConfig();
  const prisma = getPrisma();

  const line = new LineService(config.line.channelAccessToken);
  const userRepo = new UserRepository(prisma);
  const conversationRepo = new ConversationRepository(prisma);

  const gemini = new GeminiService(config.gemini.apiKey, config.gemini.model);
  const userService = new UserService(userRepo, line, config.auth);
  const chatService = new ChatService(conversationRepo, gemini);
  const webhookService = new WebhookService(line, userService, chatService);

  container = { line, userService, chatService, webhookService };
  return container;
}
