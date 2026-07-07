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

- ✅ **Phase 1** — LINE Webhook · AI Chat · User Management · Whitelist Auth ← **อยู่ตรงนี้**
- ⬜ **Phase 2** — Memory System · To-do · Reminder (LINE Push)
- ⬜ **Phase 3** — Google Calendar · Morning Brief (07:00) · Evening Wrap-up (20:00)
- ⬜ **Phase 4** — News Briefing · Content Creator · File Vault

## Architecture (Clean Architecture)

```
app/api/webhook/line/route.ts   HTTP layer — verify signature แล้วส่งต่อ ไม่มี business logic
lib/                            infrastructure — config (zod), prisma, LINE client, logger, DI container
services/                       business logic — webhook dispatch, chat, user/auth, gemini
repositories/                   data access — Prisma queries เท่านั้น
tools/                          Gemini function-calling tools + registry
prompts/                        system prompts
types/                          shared interfaces (NovaTool, ToolContext, ChatTurn)
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

## Docs

- [docs/deployment.md](docs/deployment.md) — Supabase + Vercel + production checklist
- [docs/line-setup.md](docs/line-setup.md) — สร้าง LINE OA + Messaging API channel
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
