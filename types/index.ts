import type { FunctionDeclaration } from "@google/genai";
import type { User } from "@prisma/client";

/** Context passed to every tool execution — always scoped to one user. */
export interface ToolContext {
  user: User;
}

/** A Gemini function-calling tool Nova can execute. */
export interface NovaTool {
  declaration: FunctionDeclaration;
  execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<Record<string, unknown>>;
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}
