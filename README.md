# ✨ Nova — Personal AI Assistant on LINE

ผู้ช่วย AI ส่วนตัวบน LINE Official Account · ตอบแชทด้วย Gemini · ออกแบบรองรับหลายผู้ใช้ตั้งแต่วันแรก

## Stack

| Layer | Technology |
|---|---|
| Frontend | LINE Official Account |
| Backend | Next.js 15 (App Router) + TypeScript |
| Database | Supabase PostgreSQL + Prisma ORM |
| AI | Google Gemini (`gemini-2.5-flash`) + Function Calling |
| Hosting | Vercel |
| Scheduler | Vercel Cron (Phase 3) |
| Auth | LINE User ID Whitelist (Phase 1) |

## Roadmap

- ✅ **Phase 1** — LINE Webhook · AI Chat · User Management · Whitelist Auth
- ✅ **Phase 2** — Memory (semantic search) · To-do · Reminder (LINE Push) · Google Calendar OAuth · News
- ✅ **Phase 3** — Morning Brief 07:00 · Evening Wrap-up 20:00 · Rich Menu · Quick Commands · Settings · Weather ← **อยู่ตรงนี้**
- ⬜ **Phase 4** — Content Creator · File Vault · Admin Dashboard

## ความสามารถ

| พูดกับ Nova / กดเมนู | สิ่งที่เกิดขึ้น |
|---|---|
| "จำว่าห้องพักมี 24 ห้อง" · "ผมชอบอะไร" | บันทึก / ค้น memory (pgvector semantic + keyword) |
| "เพิ่มงาน… พรุ่งนี้เช้า" · "งานของผมวันนี้" | สร้าง / list / complete to-do |
| "เตือนฉัน 6 โมงเย็นให้ส่งรายงาน" | reminder → LINE push ตามเวลา |
| "นัดประชุมพรุ่งนี้ 10 โมง" | สร้าง Google Calendar event (OAuth ครั้งแรก) |
| "ติดตามข่าว AI" / "สรุปข่าวโรงแรม" | subscribe / อ่านข่าวจาก Google News |
| **Rich Menu / พิมพ์** `calendar` `todo` `reminder` `news` `memory` `settings` | Quick Command — ตอบทันทีโดยไม่เรียก Gemini |
| `settings` · `ปิดสรุปเช้า` · `เปิดข่าว` · `english` | ดู / ปรับการตั้งค่าราย user |
| ทุกเช้า **07:00** อัตโนมัติ | ☀️ Morning Brief: นัดหมาย + งาน + เกินกำหนด + ข่าว + อากาศ |
| ทุกเย็น **20:00** อัตโนมัติ | 🌙 Evening Wrap-up: งานเสร็จ + งานเหลือ + พรุ่งนี้ + ลำดับความสำคัญ |

## Architecture (Clean Architecture)

```
app/api/webhook/line/           HTTP layer — verify signature แล้วส่งต่อ ไม่มี business logic
app/api/cron/morning-brief/     ☀️ Morning Brief 07:00 (Vercel Cron)
app/api/cron/evening-wrapup/    🌙 Evening Wrap-up 20:00 (Vercel Cron)
app/api/cron/reminders/         reminder dispatcher (ping ทุก 1–5 นาที)
app/api/auth/google/(+callback) Google Calendar OAuth flow
lib/                            infrastructure — config (zod), prisma, LINE client, logger, time, DI container
services/                       business logic — chat, gemini, memory, todo, reminder, calendar, news,
                                weather, brief, settings, quick-command, rich-menu, offline-responder
repositories/                   data access — Prisma queries เท่านั้น
tools/                          Gemini function-calling tools + registry
prompts/                        system prompts (persona + memories + tool rules)
scripts/                        CLI — richmenu (create/delete/link)
types/                          shared interfaces (NovaTool, ToolContext, ToolServices)
prisma/                         schema + migrations + seed
components/                     UI (admin dashboard — phase ถัดไป)
```

**Dependency flow:** route → container → services → repositories → Prisma. ทุก service รับ dependencies ผ่าน constructor (composition root อยู่ที่ [lib/container.ts](lib/container.ts))

## Database

ทุกตารางมี `id`, `user_id`, `created_at`, `updated_at` — multi-user ตั้งแต่ schema แรก:
`users` · `user_settings` · `conversations` · `memories` · `todos` · `reminders` · `calendar_events` · `settings` · `news_preferences`

## Quick start (local)

```bash
npm install
cp .env.example .env        # กรอกค่าตาม docs/deployment.md
npx prisma migrate deploy   # สร้างตารางใน Supabase
npm run db:seed             # สร้าง owner user จาก OWNER_LINE_USER_ID
npm run dev                 # + ngrok/cloudflared สำหรับทดสอบ webhook
```

Webhook endpoint: `POST /api/webhook/line`

## Whitelist Authentication (Phase 1)

1. ผู้ใช้ใหม่ทักบอท → ระบบสร้าง user record เป็น `is_active = false`
2. บอทตอบ LINE User ID กลับไป (ใช้สำหรับ whitelist)
3. เอา ID ใส่ env `OWNER_LINE_USER_ID` (เจ้าของ) หรือ `WHITELIST_LINE_USER_IDS` (คนอื่น, คั่น comma) แล้ว redeploy
4. ทักอีกครั้ง → activate อัตโนมัติ ใช้งานได้ทันที
   (หรือ activate ตรง ๆ ใน DB: `UPDATE users SET is_active = true WHERE line_user_id = '...'`)

## Rich Menu & Quick Commands (Phase 3)

Rich Menu 6 ปุ่ม (Calendar · Todo · Reminder · News · Memory · Settings) — สร้างด้วย:

```bash
npm run line:richmenu:create   # สร้างเมนู + รูป + ตั้ง default
npm run line:richmenu:delete
npm run line:richmenu:link [lineUserId]
```

กดปุ่ม = ส่ง Quick Command (`calendar`, `todo`, …) ซึ่งตอบทันทีโดยไม่เรียก Gemini · พิมพ์เองก็ได้
ดู [docs/rich-menu.md](docs/rich-menu.md)

## Settings (ราย user)

ตาราง `user_settings` — `morningBriefEnabled` · `eveningBriefEnabled` · `newsEnabled` · `weatherEnabled` · `timezone` (default `Asia/Bangkok`) · `language` (default `th`)
ปรับผ่านแชท: `settings` เพื่อดู · `ปิดสรุปเช้า` / `เปิดข่าว` / `english` เพื่อเปลี่ยน

## Scheduler

| งาน | เวลา (ไทย) | Cron (UTC) | Endpoint |
|---|---|---|---|
| ☀️ Morning Brief | 07:00 | `0 0 * * *` | `/api/cron/morning-brief` |
| 🌙 Evening Wrap-up | 20:00 | `0 13 * * *` | `/api/cron/evening-wrapup` |
| ⏰ Reminders | ทุก 1–5 นาที | — | `/api/cron/reminders` |

- Morning/Evening ตั้งไว้ใน `vercel.json` แล้ว (Vercel Cron)
- **Reminders** ต้อง ping เอง: Vercel **Hobby** จำกัด cron รายวัน → ใช้ [cron-job.org](https://cron-job.org) (ฟรี) ยิงพร้อม header `Authorization: Bearer <CRON_SECRET>` · Pro เพิ่มใน `vercel.json` ได้เลย
- Fallback: ทุกครั้งที่มีคนทักบอท ระบบเช็ค reminder ค้างส่งให้อัตโนมัติ
- ดู [docs/morning-brief.md](docs/morning-brief.md)

## Docs

- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — เช็คลิสต์ deploy ทีละขั้น
- [docs/deployment.md](docs/deployment.md) — Supabase + Vercel + production checklist
- [docs/line-setup.md](docs/line-setup.md) — สร้าง LINE OA + Messaging API channel
- [docs/google-calendar-oauth.md](docs/google-calendar-oauth.md) — ตั้งค่า Google Calendar OAuth
- [docs/morning-brief.md](docs/morning-brief.md) — Morning Brief + Evening Wrap-up
- [docs/rich-menu.md](docs/rich-menu.md) — Rich Menu + Quick Commands
- [docs/sample-prompts.md](docs/sample-prompts.md) — ตัวอย่างการใช้งาน

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | prisma generate + next build |
| `npm run typecheck` | tsc --noEmit |
| `npm run db:migrate` | apply migrations (production) |
| `npm run db:seed` | seed owner user |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run line:richmenu:create` | สร้าง Rich Menu + รูป + ตั้ง default |
| `npm run line:richmenu:delete` | ลบ Rich Menu ทั้งหมด |
| `npm run line:richmenu:link` | ตั้ง default / link ให้ผู้ใช้ |
