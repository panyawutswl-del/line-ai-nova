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
- ✅ **Phase 2** — Memory (semantic search) · To-do · Reminder (LINE Push) · Google Calendar OAuth · News · Daily Brief 07:00 ← **อยู่ตรงนี้**
- ⬜ **Phase 3** — Evening Wrap-up (20:00) · Rich Menu
- ⬜ **Phase 4** — Content Creator · File Vault · Admin Dashboard

## ความสามารถ (Phase 2)

| พูดกับ Nova | สิ่งที่เกิดขึ้น |
|---|---|
| "จำว่าห้องพักมี 24 ห้อง" | บันทึก memory (pgvector semantic search) |
| "ผมชอบอะไร" / "จำอะไรไว้บ้าง" | ค้น memory แบบ semantic + keyword |
| "ลืมเรื่อง…" | ลบ memory |
| "เพิ่มงาน โทรหาช่างแอร์ พรุ่งนี้เช้า" | สร้าง to-do พร้อม due date |
| "งานของผมวันนี้" / "ทำเสร็จแล้ว…" | list / complete to-do |
| "เตือนฉัน 6 โมงเย็นให้ส่งรายงาน" | reminder → LINE push ตามเวลา |
| "นัดประชุมพรุ่งนี้ 10 โมง" | สร้าง Google Calendar event (OAuth ครั้งแรก) |
| "ติดตามข่าว AI" / "สรุปข่าวโรงแรม" | subscribe / อ่านข่าวจาก Google News |
| ทุกเช้า 07:00 อัตโนมัติ | ☀️ Daily Brief: นัดหมาย + งาน + เตือน + ข่าว |

## Architecture (Clean Architecture)

```
app/api/webhook/line/           HTTP layer — verify signature แล้วส่งต่อ ไม่มี business logic
app/api/cron/morning-brief/     Daily Brief 07:00 (Vercel Cron)
app/api/cron/reminders/         reminder dispatcher (ping ทุก 1–5 นาที)
app/api/auth/google/(+callback) Google Calendar OAuth flow
lib/                            infrastructure — config (zod), prisma, LINE client, logger, time, DI container
services/                       business logic — chat, gemini, embedding, memory, todo, reminder, calendar, news, brief
repositories/                   data access — Prisma queries เท่านั้น
tools/                          Gemini function-calling tools (17 ตัว) + registry
prompts/                        system prompts (persona + memories + tool rules)
types/                          shared interfaces (NovaTool, ToolContext, ToolServices)
prisma/                         schema + migrations + seed
components/                     UI (admin dashboard — phase ถัดไป)
```

**Dependency flow:** route → container → services → repositories → Prisma. ทุก service รับ dependencies ผ่าน constructor (composition root อยู่ที่ [lib/container.ts](lib/container.ts))

## Database

ทุกตารางมี `id`, `user_id`, `created_at`, `updated_at` — multi-user ตั้งแต่ schema แรก:
`users` · `conversations` · `memories` · `todos` · `reminders` · `calendar_events` · `settings` · `news_preferences`

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

## Scheduler (Phase 2)

- **Daily Brief 07:00** — Vercel Cron ยิง `/api/cron/morning-brief` ทุกวัน 00:00 UTC (ตั้งใน `vercel.json` แล้ว)
- **Reminders** — endpoint `/api/cron/reminders` ต้องถูก ping ทุก 1–5 นาที
  - Vercel **Hobby** จำกัด cron รายวัน → ใช้ [cron-job.org](https://cron-job.org) (ฟรี) ยิงพร้อม header `Authorization: Bearer <CRON_SECRET>`
  - Vercel **Pro** → เพิ่ม entry ใน `vercel.json` ได้เลย: `{"path": "/api/cron/reminders", "schedule": "*/5 * * * *"}`
  - Fallback ในตัว: ทุกครั้งที่มีคนทักบอท ระบบเช็ค reminder ค้างส่งให้อัตโนมัติ

## Docs

- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — เช็คลิสต์ deploy ทีละขั้น
- [docs/deployment.md](docs/deployment.md) — Supabase + Vercel + production checklist
- [docs/line-setup.md](docs/line-setup.md) — สร้าง LINE OA + Messaging API channel
- [docs/google-calendar-oauth.md](docs/google-calendar-oauth.md) — ตั้งค่า Google Calendar OAuth
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
# line-ai-nova
