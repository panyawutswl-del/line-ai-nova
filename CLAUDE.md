# CLAUDE.md — Nova · Personal AI Assistant on LINE

## What this is

ผู้ช่วย AI ส่วนตัวบน LINE OA ชื่อ **Nova** — ตอบแชทด้วย Gemini, มี memory/todo/reminder/calendar ตาม roadmap
ผู้ใช้หลักคือเจ้าของคนเดียว แต่ **ทุกอย่างต้อง multi-user ready** (ทุก query scope ด้วย `user_id` เสมอ)

## Stack — locked

- Next.js 15 App Router + TypeScript · Vercel
- Supabase PostgreSQL + Prisma 6 (`DATABASE_URL` pooled 6543 / `DIRECT_URL` 5432)
- `@google/genai@1` — ใช้ `gemini-2.5-flash` เท่านั้น (free tier: 2.0-flash → 429 quota=0, 1.5-flash → 404 deprecated, 503 intermittent → retry มีแล้วใน gemini.service)
- `@line/bot-sdk@9`

## Architecture rules

- Clean Architecture: `route → lib/container.ts (composition root) → services → repositories → Prisma`
- route ทำแค่ verify signature + dispatch — ห้ามใส่ business logic
- ทุก service รับ deps ทาง constructor · repository ห้ามมี business logic
- Tool ใหม่ (function calling): implement `NovaTool` ใน `tools/` แล้ว register ใน `tools/index.ts` — loop execute อยู่ใน `services/gemini.service.ts` แล้ว
- Gemini call มี timeout 8s เสมอ (LINE webhook ต้องตอบเร็ว)

## Phase status

- ✅ Phase 1 — webhook, AI chat, user management, whitelist auth
- ✅ Phase 2 — Memory (pgvector semantic search + PIN/AUTO), To-do, Reminder (LINE push), Google Calendar OAuth, News (Google News RSS), Daily Brief 07:00
- ⬜ Phase 3 — Evening Wrap-up 20:00, Rich Menu
- ⬜ Phase 4 — Content Creator, File Vault, Admin Dashboard
- **ห้ามข้าม phase — ทำทีละ phase แล้วรอ approval**

## Phase 2 implementation notes

- Semantic search: `gemini-embedding-001` @ 768 dims → pgvector `memories.embedding` (Unsupported type ใน Prisma, query ผ่าน $queryRawUnsafe) — embedding fail = fallback keyword search เสมอ
- Thai NL dates: ไม่มี parser — Gemini แปลงเป็น ISO+07:00 เอง (เวลาปัจจุบันอยู่ใน system prompt, format กำหนดใน tool description)
- Reminder dispatch: claim แบบ atomic (updateMany WHERE status=PENDING) กัน double-send · Vercel Hobby cron รายวันเท่านั้น → `/api/cron/reminders` ต้องใช้ external pinger + มี fallback เช็คตอนมีข้อความเข้า
- Google OAuth: token เก็บใน settings table key `google_oauth` · state = lineUserId + HMAC(channelSecret)
- Cron endpoints ป้องกันด้วย `CRON_SECRET` (Bearer header)

## Auth model (Phase 1)

- user ใหม่ถูกสร้างเป็น `is_active=false` · บอทตอบ LINE User ID กลับให้เอาไป whitelist
- env `OWNER_LINE_USER_ID` (role OWNER) + `WHITELIST_LINE_USER_IDS` (comma) → auto-activate ตอนทักครั้งถัดไป

## Don'ts

- ❌ Hardcode secrets — env vars ผ่าน `lib/config.ts` (zod) เท่านั้น
- ❌ ข้าม LINE signature verification
- ❌ query โดยไม่ scope `user_id`
- ❌ new PrismaClient ตรง ๆ — ใช้ `getPrisma()` / DI container
- ❌ เปลี่ยน Gemini model โดยไม่ทดสอบบน free tier
