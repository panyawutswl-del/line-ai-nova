import type {
  PrismaClient,
  Todo,
  TodoPriority,
  TodoStatus,
} from "@prisma/client";

const OPEN_STATUSES: TodoStatus[] = ["PENDING", "IN_PROGRESS"];

export class TodoRepository {
  constructor(private prisma: PrismaClient) {}

  create(data: {
    userId: string;
    title: string;
    description?: string;
    priority?: TodoPriority;
    dueDate?: Date;
    reminderTime?: Date;
  }): Promise<Todo> {
    return this.prisma.todo.create({ data });
  }

  listOpen(userId: string, take = 20): Promise<Todo[]> {
    return this.prisma.todo.findMany({
      where: { userId, status: { in: OPEN_STATUSES } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take,
    });
  }

  listDueBetween(userId: string, start: Date, end: Date): Promise<Todo[]> {
    return this.prisma.todo.findMany({
      where: {
        userId,
        status: { in: OPEN_STATUSES },
        dueDate: { gte: start, lt: end },
      },
      orderBy: { dueDate: "asc" },
    });
  }

  listOverdue(userId: string, now: Date): Promise<Todo[]> {
    return this.prisma.todo.findMany({
      where: { userId, status: { in: OPEN_STATUSES }, dueDate: { lt: now } },
      orderBy: { dueDate: "asc" },
    });
  }

  listCompletedSince(userId: string, since: Date): Promise<Todo[]> {
    return this.prisma.todo.findMany({
      where: { userId, status: "COMPLETED", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
    });
  }

  searchOpen(userId: string, query: string, take = 5): Promise<Todo[]> {
    return this.prisma.todo.findMany({
      where: {
        userId,
        status: { in: OPEN_STATUSES },
        title: { contains: query, mode: "insensitive" },
      },
      take,
    });
  }

  complete(id: string): Promise<Todo> {
    return this.prisma.todo.update({
      where: { id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.todo.delete({ where: { id } });
  }
}
