import type { PrismaClient, Role, User } from "@prisma/client";

export class UserRepository {
  constructor(private prisma: PrismaClient) {}

  findByLineUserId(lineUserId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { lineUserId } });
  }

  create(data: {
    lineUserId: string;
    displayName?: string;
    pictureUrl?: string;
    role: Role;
    isActive: boolean;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(
    id: string,
    data: Partial<
      Pick<
        User,
        "displayName" | "pictureUrl" | "role" | "isActive" | "lastLogin"
      >
    >,
  ): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  list(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  }
}
