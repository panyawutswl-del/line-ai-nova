import type { Todo, TodoPriority } from "@prisma/client";
import type { TodoRepository } from "@/repositories/todo.repository";
import { bangkokDayRange } from "@/lib/time";

export type TodoFilter = "today" | "upcoming" | "overdue" | "completed" | "all";

export type TodoMatchResult =
  | { status: "done"; todo: Todo }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: Todo[] };

export class TodoService {
  constructor(private todos: TodoRepository) {}

  create(
    userId: string,
    input: {
      title: string;
      description?: string;
      priority?: TodoPriority;
      dueDate?: Date;
    },
  ): Promise<Todo> {
    return this.todos.create({ userId, ...input });
  }

  async list(userId: string, filter: TodoFilter): Promise<Todo[]> {
    const now = new Date();
    const { start, end } = bangkokDayRange();
    switch (filter) {
      case "today":
        return this.todos.listDueBetween(userId, start, end);
      case "overdue":
        return this.todos.listOverdue(userId, now);
      case "upcoming":
        return (await this.todos.listOpen(userId)).filter(
          (t) => !t.dueDate || t.dueDate >= end,
        );
      case "completed": {
        const { start: weekAgo } = bangkokDayRange(-7);
        return this.todos.listCompletedSince(userId, weekAgo);
      }
      case "all":
        return this.todos.listOpen(userId);
    }
  }

  async completeByQuery(userId: string, query: string): Promise<TodoMatchResult> {
    return this.resolveAndApply(userId, query, (id) => this.todos.complete(id));
  }

  async deleteByQuery(userId: string, query: string): Promise<TodoMatchResult> {
    return this.resolveAndApply(userId, query, async (id, match) => {
      await this.todos.delete(id);
      return match;
    });
  }

  private async resolveAndApply(
    userId: string,
    query: string,
    apply: (id: string, match: Todo) => Promise<Todo>,
  ): Promise<TodoMatchResult> {
    const matches = await this.todos.searchOpen(userId, query);
    if (matches.length === 0) return { status: "not_found" };
    if (matches.length > 1) return { status: "ambiguous", candidates: matches };
    const todo = await apply(matches[0].id, matches[0]);
    return { status: "done", todo };
  }
}
