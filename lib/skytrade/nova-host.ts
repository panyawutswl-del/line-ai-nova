import type {
  Market,
  NovaHost,
  NovaModuleRegistration,
  NovaScheduleRegistration,
  NovaDailyBriefRegistration,
} from "@skytrade/nova-skytrade-module";

/**
 * Nova's concrete implementation of the SkyTrade `NovaHost` contract.
 *
 * The SkyTrade SDK is host-agnostic: `registerSkyTradeModule` pushes the module,
 * its three market schedules, and its three Daily Brief deliveries into these
 * sinks, and Nova decides how/when to invoke the registered callbacks. This
 * registry just collects them and exposes lookup + trigger helpers so Nova's own
 * scheduling infrastructure (cron routes) can fire a market's brief on demand.
 *
 * It holds no business logic and never touches the SkyTrade pipeline directly —
 * every registered callback drives the existing SkyTrade pipeline internally.
 */
export class NovaSkyTradeHost implements NovaHost {
  private module: NovaModuleRegistration | null = null;
  private readonly schedules = new Map<Market, NovaScheduleRegistration>();
  private readonly briefs = new Map<Market, NovaDailyBriefRegistration>();

  registerModule(module: NovaModuleRegistration): void {
    this.module = module;
  }

  registerSchedule(schedule: NovaScheduleRegistration): void {
    this.schedules.set(schedule.market, schedule);
  }

  registerDailyBrief(brief: NovaDailyBriefRegistration): void {
    this.briefs.set(brief.market, brief);
  }

  /** The registered SkyTrade module, or null before registration. */
  get registeredModule(): NovaModuleRegistration | null {
    return this.module;
  }

  /** All registered market schedules (metadata Nova's cron layer reads). */
  listSchedules(): NovaScheduleRegistration[] {
    return [...this.schedules.values()];
  }

  /**
   * Run one market's Daily Brief through the registered SkyTrade callback, which
   * drives the existing pipeline end-to-end. Throws if the market was never
   * registered (a caller mistake) — the pipeline itself throws a meaningful error
   * if SkyTrade was not configured first.
   */
  async deliverDailyBrief(market: Market): Promise<void> {
    const brief = this.briefs.get(market);
    if (!brief) {
      throw new Error(`No SkyTrade Daily Brief registered for market "${market}"`);
    }
    await brief.deliver();
  }
}
