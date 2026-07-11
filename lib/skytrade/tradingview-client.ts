import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type {
  TradingViewIndicators,
  TradingViewMcpClient,
  TradingViewMcpRequest,
  TradingViewMcpSnapshot,
} from "@skytrade/tradingview-mcp";

/**
 * Concrete TradingView MCP transport for SkyTrade's single data source.
 *
 * Reuses the already-validated `tradingview-mcp-server` npm package (a project
 * dependency) through its `tradingview-cli lookup` command, which reads a live
 * snapshot from TradingView's screener API. We shell out to the CLI — the mode
 * that was validated — via Node's own binary, request the columns SkyTrade's
 * analysis needs, and map the JSON onto the `TradingViewMcpSnapshot` contract.
 *
 * This file owns ONLY the transport: no analysis, normalization, formatting, or
 * scheduling logic. Missing indicator fields are simply omitted (SkyTrade's pure
 * mapper normalizes absent values to null). The screener exposes a single live
 * snapshot, not OHLC history, so `candles` is empty — the Analysis Engine falls
 * back to the provided indicators and pivot levels.
 */

const execFileAsync = promisify(execFile);

// A Node `require` bound to this module so we can resolve the installed CLI's
// real filesystem path at runtime. Named `nodeRequire` (not `require`) and given
// a computed specifier so the Next.js bundler leaves the resolution to Node.
const nodeRequire = createRequire(import.meta.url);
const CLI_SPECIFIER = "tradingview-mcp-server" + "/dist/cli.js";

/** Screener columns requested per symbol, mapped onto the snapshot below. */
const LOOKUP_COLUMNS = [
  "open",
  "high",
  "low",
  "close",
  "volume",
  "EMA10",
  "EMA20",
  "EMA50",
  "EMA200",
  "RSI",
  "ATR",
  "VWAP",
  "MACD.macd",
  "MACD.signal",
  "BB.upper",
  "BB.basis",
  "BB.lower",
  "Pivot.M.Classic.S1",
  "Pivot.M.Classic.R1",
  "average_volume_90d_calc",
] as const;

const LOOKUP_TIMEOUT_MS = 15_000;
const LOOKUP_MAX_BUFFER = 4 * 1024 * 1024;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface ScreenerRow {
  readonly symbol?: string;
  readonly [field: string]: unknown;
}

interface ScreenerResponse {
  readonly symbols?: readonly ScreenerRow[];
}

/** Read a finite numeric column, or `undefined` when absent/non-numeric. */
function num(row: ScreenerRow, field: string): number | undefined {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read a required OHLCV field, failing fast (never fabricated) when missing. */
function requireNum(row: ScreenerRow, field: string, symbol: string): number {
  const value = num(row, field);
  if (value === undefined) {
    throw new Error(`TradingView lookup for ${symbol} is missing required field "${field}"`);
  }
  return value;
}

function toIndicators(row: ScreenerRow): TradingViewIndicators {
  const ind: Mutable<TradingViewIndicators> = {};

  const ema10 = num(row, "EMA10");
  if (ema10 !== undefined) ind.EMA10 = ema10;
  const ema20 = num(row, "EMA20");
  if (ema20 !== undefined) ind.EMA20 = ema20;
  const ema50 = num(row, "EMA50");
  if (ema50 !== undefined) ind.EMA50 = ema50;
  const ema200 = num(row, "EMA200");
  if (ema200 !== undefined) ind.EMA200 = ema200;

  const rsi = num(row, "RSI");
  if (rsi !== undefined) ind.RSI = rsi;
  const atr = num(row, "ATR");
  if (atr !== undefined) ind.ATR = atr;
  const vwap = num(row, "VWAP");
  if (vwap !== undefined) ind.VWAP = vwap;

  const macd = num(row, "MACD.macd");
  const signal = num(row, "MACD.signal");
  if (macd !== undefined && signal !== undefined) {
    ind.MACD = { macd, signal, histogram: macd - signal };
  }

  const upper = num(row, "BB.upper");
  const middle = num(row, "BB.basis");
  const lower = num(row, "BB.lower");
  if (upper !== undefined && middle !== undefined && lower !== undefined) {
    ind.BollingerBands = { upper, middle, lower };
  }

  const support = num(row, "Pivot.M.Classic.S1");
  if (support !== undefined) ind.support = support;
  const resistance = num(row, "Pivot.M.Classic.R1");
  if (resistance !== undefined) ind.resistance = resistance;

  const averageVolume = num(row, "average_volume_90d_calc");
  if (averageVolume !== undefined) ind.averageVolume = averageVolume;

  return ind;
}

function toSnapshot(request: TradingViewMcpRequest, row: ScreenerRow): TradingViewMcpSnapshot {
  const symbol = request.symbol;
  return {
    symbol,
    market: request.market ?? "",
    timeframe: request.timeframe,
    // The screener returns a live snapshot with no timestamp; stamp read time.
    time: new Date().toISOString(),
    open: requireNum(row, "open", symbol),
    high: requireNum(row, "high", symbol),
    low: requireNum(row, "low", symbol),
    close: requireNum(row, "close", symbol),
    volume: requireNum(row, "volume", symbol),
    indicators: toIndicators(row),
    candles: [],
  };
}

/**
 * Create the concrete TradingView MCP client. Each `getSnapshot` invokes the
 * validated `tradingview-cli lookup` once for the requested symbol and returns a
 * fully-formed `TradingViewMcpSnapshot`. Fails fast with a wrapped, meaningful
 * error on any CLI, parse, or missing-data failure — never silently.
 */
export function createTradingViewMcpClient(): TradingViewMcpClient {
  return {
    async getSnapshot(request: TradingViewMcpRequest): Promise<TradingViewMcpSnapshot> {
      const cliPath = nodeRequire.resolve(CLI_SPECIFIER);
      const args = [cliPath, "lookup", request.symbol];
      for (const column of LOOKUP_COLUMNS) {
        args.push("--columns", column);
      }
      args.push("--format", "json");

      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(process.execPath, args, {
          timeout: LOOKUP_TIMEOUT_MS,
          maxBuffer: LOOKUP_MAX_BUFFER,
        }));
      } catch (cause) {
        throw new Error(
          `TradingView lookup failed for ${request.symbol}: ${(cause as Error).message}`,
          { cause },
        );
      }

      let response: ScreenerResponse;
      try {
        response = JSON.parse(stdout) as ScreenerResponse;
      } catch (cause) {
        throw new Error(
          `TradingView lookup for ${request.symbol} returned invalid JSON: ${(cause as Error).message}`,
          { cause },
        );
      }

      const row = response.symbols?.[0];
      if (!row) {
        throw new Error(`TradingView lookup returned no data for ${request.symbol}`);
      }

      return toSnapshot(request, row);
    },
  };
}
