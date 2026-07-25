import { describe, expect, it, vi } from "vitest";
import { InfrastructureAlertService } from "@/services/infrastructure-alert.service";

describe("InfrastructureAlertService", () => {
  it("formats and pushes an On Battery notification to the owner", async () => {
    const pushText = vi.fn().mockResolvedValue(undefined);
    const service = new InfrastructureAlertService({ pushText }, "U-owner");

    await service.notifyUpsOnBattery({ dsmMessage: "UPS has entered battery mode." });

    expect(pushText).toHaveBeenCalledWith(
      "U-owner",
      expect.stringContaining("ไฟฟ้าดับ — NAS กำลังใช้แบตเตอรี่จาก UPS"),
    );
    expect(pushText).toHaveBeenCalledWith(
      "U-owner",
      expect.stringContaining("UPS has entered battery mode."),
    );
  });
});
