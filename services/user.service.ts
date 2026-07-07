import type { User } from "@prisma/client";
import type { UserRepository } from "@/repositories/user.repository";
import type { LineService } from "@/lib/line";
import type { AppConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * User management + whitelist authentication (Phase 1).
 *
 * Access rules:
 * - A user is allowed to chat only when `isActive` is true.
 * - IDs in OWNER_LINE_USER_ID / WHITELIST_LINE_USER_IDS are auto-activated
 *   on first contact; everyone else is stored inactive for later approval.
 */
export class UserService {
  constructor(
    private users: UserRepository,
    private line: LineService,
    private authConfig: AppConfig["auth"],
  ) {}

  async ensureUser(lineUserId: string): Promise<User> {
    const existing = await this.users.findByLineUserId(lineUserId);
    if (existing) {
      // Whitelist can grow after first contact — re-check inactive users.
      if (!existing.isActive && this.isWhitelisted(lineUserId)) {
        logger.info("user.activated_from_whitelist", { userId: existing.id });
        return this.users.update(existing.id, {
          isActive: true,
          role: this.roleFor(lineUserId),
        });
      }
      return existing;
    }

    const profile = await this.line.getProfile(lineUserId);
    const user = await this.users.create({
      lineUserId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
      role: this.roleFor(lineUserId),
      isActive: this.isWhitelisted(lineUserId),
    });
    logger.info("user.created", {
      userId: user.id,
      isActive: user.isActive,
      role: user.role,
    });
    return user;
  }

  touchLastLogin(user: User): Promise<User> {
    return this.users.update(user.id, { lastLogin: new Date() });
  }

  private isWhitelisted(lineUserId: string): boolean {
    return this.authConfig.whitelist.includes(lineUserId);
  }

  private roleFor(lineUserId: string): "OWNER" | "USER" {
    return lineUserId === this.authConfig.ownerLineUserId ? "OWNER" : "USER";
  }
}
