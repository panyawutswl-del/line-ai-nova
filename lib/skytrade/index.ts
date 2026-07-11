import {
  registerSkyTradeModule,
  type SkyTradeService,
} from "@skytrade/nova-skytrade-module";
import { logger } from "@/lib/logger";
import { NovaSkyTradeHost } from "@/lib/skytrade/nova-host";
import { createTradingViewMcpClient } from "@/lib/skytrade/tradingview-client";

export { NovaSkyTradeHost } from "@/lib/skytrade/nova-host";

export interface SkyTradeIntegration {
  /** Registry of the SkyTrade module, schedules, and Daily Brief deliveries. */
  readonly host: NovaSkyTradeHost;
  /** The backing service, already configured with the TradingView MCP client. */
  readonly service: SkyTradeService;
}

/**
 * Compose the SkyTrade integration once during Nova startup:
 *
 *   1. Register the SkyTrade module + its three market schedules + three Daily
 *      Brief deliveries (SET · US · CRYPTO) into Nova's host registry.
 *   2. Inject the TradingView MCP client once via `service.configure`.
 *
 * This owns no analysis, MCP, or formatting logic — those live in the existing
 * SkyTrade packages and run inside the registered callbacks. It is invoked from
 * the composition root (`lib/container.ts`).
 */
export function createSkyTradeIntegration(): SkyTradeIntegration {
  const host = new NovaSkyTradeHost();
  const service = registerSkyTradeModule(host);

  // Inject SkyTrade's runtime dependency (the TradingView MCP client) once.
  service.configure({ client: createTradingViewMcpClient() });

  logger.info("skytrade.registered", {
    module: host.registeredModule?.id,
    markets: host.listSchedules().map((s) => s.market),
  });

  return { host, service };
}
