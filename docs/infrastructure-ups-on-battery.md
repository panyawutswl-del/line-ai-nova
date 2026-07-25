# Nova Infrastructure Module — UPS On Battery

## Milestone 1 scope

When DSM detects that the USB UPS has entered **On Battery** mode, Nova sends the
owner a LINE alert. This milestone deliberately excludes power restored, low
battery, NAS shutdown, and Docker health so each event can be tested separately.

## Architecture decision

```text
Synology DSM notification rule
  └─ HTTPS POST + shared secret
       └─ Nova: /api/webhook/infrastructure
            └─ InfrastructureAlertService
                 └─ existing LineService.pushText()
                      └─ Owner's Nova LINE chat
```

This direct route is preferred over `DSM → n8n → Nova` for the first alert:

- Nova already owns the delivery channel and is deployed separately from the NAS.
- It removes an n8n hop and its credentials from an urgent alert path.
- DSM Custom Webhooks can send a JSON POST with a custom header and a rule can
  restrict it to the UPS event. n8n remains suitable later for workflows that
  need fan-out, enrichment, or logging.

Keep DSM email notifications for power events enabled as an independent fallback.

## Deploy configuration

Add this Vercel environment variable to Nova in Production (and Preview if you
will test there), then redeploy:

```text
INFRASTRUCTURE_WEBHOOK_SECRET=<a long random value>
```

`OWNER_LINE_USER_ID` must already be set; it is the only recipient in milestone
1. Never put the secret in source control or in DSM's visible notification text.

The endpoint is:

```text
POST https://<your-nova-domain>/api/webhook/infrastructure
```

It accepts only:

```json
{"text":"<DSM notification text>"}
```

with header:

```text
X-Nova-Infrastructure-Secret: <same secret as Vercel>
```

## Configure DSM 7.2+

1. Open **Control Panel → Notification → Webhooks → Add**.
2. Select **Custom**. Name it `Nova Infrastructure`.
3. Create/select a rule that contains only the UPS **On Battery / power failure**
   notification. Do not send all DSM events to this endpoint.
4. Choose **POST** and content type `application/json`.
5. Set the endpoint URL shown above.
6. Add the `X-Nova-Infrastructure-Secret` header using the same Vercel secret.
7. Set the JSON body to:

   ```json
   {"text":"@@TEXT@@"}
   ```

8. Click **Send Test Message**. A successful response is:

   ```json
   {"ok":true,"event":"ups_on_battery"}
   ```

DSM supports Custom Webhooks, POST JSON bodies, headers, and the `@@TEXT@@`
placeholder. Refer to [Synology's Webhooks guide](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_notification_webhook?version=7).

## Verify safely

1. Confirm the DSM test message arrives in Nova first.
2. With DSM's UPS page visible, unplug the UPS input from mains—do **not** turn
   off the UPS.
3. Confirm DSM reports **On Battery** and Nova receives one alert.
4. Reconnect mains.

The expected Nova text starts with:

```text
⚠️ Nova แจ้งเตือนระบบ

ไฟฟ้าดับ — NAS กำลังใช้แบตเตอรี่จาก UPS
```

## Security notes

- Use the production HTTPS Nova domain; never expose this endpoint over plain HTTP.
- The header secret is mandatory. Requests without a matching secret receive 401.
- The DSM rule is the event filter. The endpoint intentionally accepts only the
  `text` message, not an arbitrary event type, in this first milestone.
- Rotate the secret in both Vercel and DSM immediately if it is exposed.
