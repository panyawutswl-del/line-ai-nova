import type { UserSettings } from "@prisma/client";
import type {
  UserSettingsRepository,
  UserSettingsUpdate,
} from "@/repositories/user-settings.repository";

/** Toggle keys a user can flip from chat. */
export type ToggleKey =
  | "morningBriefEnabled"
  | "eveningBriefEnabled"
  | "newsEnabled"
  | "weatherEnabled";

export class SettingsService {
  constructor(private repo: UserSettingsRepository) {}

  get(userId: string): Promise<UserSettings> {
    return this.repo.getOrCreate(userId);
  }

  update(userId: string, data: UserSettingsUpdate): Promise<UserSettings> {
    return this.repo.update(userId, data);
  }

  setToggle(
    userId: string,
    key: ToggleKey,
    enabled: boolean,
  ): Promise<UserSettings> {
    return this.repo.update(userId, { [key]: enabled });
  }
}
