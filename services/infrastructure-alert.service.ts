import type { LineService } from "@/lib/line";
import { logger } from "@/lib/logger";

export interface UpsOnBatteryAlert {
  /** The original message produced by DSM, retained for diagnostic context. */
  dsmMessage: string;
}

/** Sends trusted infrastructure events through Nova's existing LINE channel. */
export class InfrastructureAlertService {
  constructor(
    private line: Pick<LineService, "pushText">,
    private ownerLineUserId: string,
  ) {}

  async notifyUpsOnBattery(alert: UpsOnBatteryAlert): Promise<void> {
    const message = [
      "⚠️ Nova แจ้งเตือนระบบ",
      "",
      "ไฟฟ้าดับ — NAS กำลังใช้แบตเตอรี่จาก UPS",
      "",
      "UPS: CyberPower UT1500EG-AS",
      "สถานะ: On Battery",
      "",
      "ข้อความจาก Synology:",
      alert.dsmMessage,
    ].join("\n");

    await this.line.pushText(this.ownerLineUserId, message);
    logger.info("infrastructure.ups_on_battery_notified", {
      recipient: this.ownerLineUserId,
    });
  }
}
