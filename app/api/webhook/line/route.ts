import { NextRequest, NextResponse } from "next/server";
import { validateSignature, type WebhookRequestBody } from "@line/bot-sdk";
import { getConfig } from "@/lib/config";
import { getContainer } from "@/lib/container";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");

  const { line } = getConfig();
  if (!signature || !validateSignature(body, line.channelSecret, signature)) {
    logger.warn("webhook.invalid_signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { events } = JSON.parse(body) as WebhookRequestBody;
  const { webhookService } = getContainer();

  // Process all events; one failing event must not fail the batch,
  // otherwise LINE retries the whole delivery.
  await Promise.all(
    events.map((event) =>
      webhookService.handleEvent(event).catch((err) => {
        logger.error("webhook.unhandled_error", errorInfo(err));
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

// LINE's "Verify" button sends GET/HEAD-less checks in some flows; keep a
// friendly response for manual browser checks too.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ service: "nova-line-webhook", status: "ok" });
}
