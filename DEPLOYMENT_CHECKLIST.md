# 🚀 Deployment Checklist — Nova

ทำตามลำดับจากบนลงล่าง ใช้เวลารวมประมาณ 20–30 นาที

---

## Step 1 — สร้าง Supabase Project

- [ ] ไปที่ [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
- [ ] Name: `nova` (หรือชื่อที่ต้องการ)
- [ ] **Database Password**: ตั้งรหัสแล้ว**จดเก็บไว้ทันที** (ต้องใช้ใน connection string และดูย้อนหลังไม่ได้)
  - ⚠️ หลีกเลี่ยงอักขระพิเศษอย่าง `@ : / # ?` ในรหัส — ถ้ามีต้อง URL-encode ใน connection string
- [ ] Region: **Southeast Asia (Singapore)** — ใกล้ไทยที่สุด
- [ ] กด Create แล้วรอ provision ~2 นาที

## Step 2 — เอา DATABASE_URL และ DIRECT_URL

- [ ] ในหน้า project กดปุ่ม **Connect** (บนขวา) → แท็บ **ORMs** → เลือก **Prisma**
- [ ] คัดลอก 2 ค่า:

  | ตัวแปร | ใช้อันไหน | หน้าตา |
  |---|---|---|
  | `DATABASE_URL` | **Transaction pooler** | `...pooler.supabase.com:6543/postgres` |
  | `DIRECT_URL` | **Direct connection** | `...pooler.supabase.com:5432/postgres` (หรือ `db.<ref>.supabase.co:5432`) |

- [ ] แทน `[YOUR-PASSWORD]` ด้วยรหัสจาก Step 1 ทั้งสองค่า
- [ ] ต่อท้าย `DATABASE_URL` ด้วย `?pgbouncer=true&connection_limit=1` (สำคัญมากสำหรับ Vercel serverless)
- [ ] เก็บอีก 2 ค่าจาก **Project Settings → API**: `SUPABASE_URL` และ `SUPABASE_ANON_KEY` (anon public)

## Step 3 — รัน Prisma Migration (จากเครื่องตัวเอง)

- [ ] `cp .env.example .env` แล้วกรอกค่า `DATABASE_URL` และ `DIRECT_URL` จาก Step 2
- [ ] รันตามลำดับ:

  ```bash
  npm install              # ถ้ายังไม่ได้ลง
  npx prisma migrate deploy
  ```

  ผลที่ถูกต้อง: applied 2 migrations — `20260707000000_init` และ `20260707130000_phase2_memory_vector` ✅
  (migration ที่สองเปิด pgvector extension สำหรับ semantic memory search — Supabase มีให้ในตัว)

- [ ] ตรวจสอบ: เปิด Supabase → **Table Editor** → ต้องเห็น 8 ตาราง
  (`users, conversations, memories, todos, reminders, calendar_events, settings, news_preferences`)
- [ ] (ทำทีหลังได้) seed owner: กรอก `OWNER_LINE_USER_ID` ใน `.env` แล้วรัน `npm run db:seed`
  — ยังไม่รู้ ID ตัวเองก็ข้ามไปก่อน เดี๋ยวบอทบอกให้ใน Step 6

  **ถ้า migrate ค้าง/error P1001**: เช็คว่าใช้ `DIRECT_URL` port 5432 ถูกต้อง และรหัสผ่านไม่มีอักขระพิเศษที่ยังไม่ได้ encode

## Step 4 — Deploy ขึ้น Vercel + ตั้ง Environment Variables

- [ ] Push โค้ดขึ้น GitHub:

  ```bash
  git add -A && git commit -m "Nova Phase 1"
  git remote add origin <your-repo-url>
  git push -u origin main
  ```

- [ ] [vercel.com/new](https://vercel.com/new) → Import repo → Framework: Next.js (auto) → **อย่าเพิ่งกด Deploy** — ใส่ env ก่อน
- [ ] ใส่ Environment Variables (Production) ทั้งหมดนี้:

  | Variable | ค่า |
  |---|---|
  | `DATABASE_URL` | pooled 6543 + `?pgbouncer=true&connection_limit=1` |
  | `DIRECT_URL` | direct 5432 |
  | `SUPABASE_URL` | จาก Step 2 |
  | `SUPABASE_ANON_KEY` | จาก Step 2 |
  | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
  | `LINE_CHANNEL_SECRET` | LINE console → Basic settings |
  | `LINE_CHANNEL_ACCESS_TOKEN` | LINE console → Messaging API → Issue |
  | `OWNER_LINE_USER_ID` | เว้นว่างไว้ก่อนก็ได้ (เติมใน Step 6) |
  | `CRON_SECRET` | สุ่มจาก `openssl rand -hex 24` (กัน cron endpoint โดนยิงเล่น) |
  | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | (optional) ดู [docs/google-calendar-oauth.md](docs/google-calendar-oauth.md) |

- [ ] กด **Deploy** → รอ build ผ่าน → ได้ URL เช่น `https://nova-xxx.vercel.app`
- [ ] ทดสอบ: เปิด `https://<app>.vercel.app/api/webhook/line` ในเบราว์เซอร์ → ต้องเห็น `{"service":"nova-line-webhook","status":"ok"}`

## Step 5 — เชื่อม LINE Webhook

> ยังไม่มี LINE channel? ดู [docs/line-setup.md](docs/line-setup.md) ก่อน

- [ ] [LINE Developers Console](https://developers.line.biz/console/) → channel → แท็บ **Messaging API**
- [ ] **Webhook URL**: `https://<app>.vercel.app/api/webhook/line` → **Update**
- [ ] กด **Verify** → ต้องขึ้น **Success** ✅
- [ ] เปิดสวิตช์ **Use webhook** = ON
- [ ] ใน [LINE OA Manager](https://manager.line.biz/) → **Response settings**:
  - Chat: **OFF** · Auto-response: **OFF** · Webhooks: **ON**
  (ไม่ปิด auto-response = ผู้ใช้ได้ข้อความซ้ำ 2 ชุด)

## Step 6 — Whitelist ตัวเอง + ทดสอบจบ

- [ ] สแกน QR code (แท็บ Messaging API) เพิ่มบอทเป็นเพื่อน
- [ ] ทักอะไรก็ได้ → บอทตอบว่ายังไม่ได้รับอนุญาต **พร้อม LINE User ID ของคุณ** (`U...`)
- [ ] Vercel → Settings → Environment Variables → ใส่ ID ลงใน `OWNER_LINE_USER_ID` → **Redeploy**
- [ ] ทักอีกครั้ง → ระบบ activate อัตโนมัติ → Nova ตอบด้วย Gemini ✅

## Step 7 — Scheduler (Phase 2)

**Daily Brief 07:00** — ทำงานอัตโนมัติ (Vercel Cron ตั้งไว้ใน `vercel.json` แล้ว) แค่เช็คว่า `CRON_SECRET` ตั้งบน Vercel แล้ว

**Reminder dispatcher** — Vercel Hobby จำกัด cron ให้รันได้แค่วันละครั้ง จึงต้องใช้ตัว ping ภายนอก (ฟรี):

- [ ] สมัคร [cron-job.org](https://cron-job.org) (ฟรี)
- [ ] สร้าง job ใหม่:
  - URL: `https://<app>.vercel.app/api/cron/reminders`
  - Schedule: ทุก **5 นาที** (หรือ 1 นาทีถ้าอยากเตือนตรงเวลาเป๊ะ)
  - Advanced → Headers: `Authorization: Bearer <CRON_SECRET>`
- [ ] ทดสอบ: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<app>.vercel.app/api/cron/reminders` → `{"ok":true,"sent":0}`

> ใช้ Vercel Pro? ข้าม cron-job.org แล้วเพิ่มใน `vercel.json`: `{"path": "/api/cron/reminders", "schedule": "*/5 * * * *"}`

## Step 8 — Google Calendar (optional)

- [ ] ทำตาม [docs/google-calendar-oauth.md](docs/google-calendar-oauth.md) → ตั้ง 3 env → Redeploy
- [ ] พิมพ์ "นัดประชุมพรุ่งนี้ 10 โมง" → Nova ส่งลิงก์เชื่อมต่อ → กด Allow → สั่งใหม่อีกครั้ง

## ✅ Final check

- [ ] ถาม "วันนี้วันอะไร" → ตอบวันที่ถูกต้อง (function calling ทำงาน)
- [ ] "จำว่าฉันชอบกาแฟดำ" → แล้วถาม "ผมชอบอะไร" → ตอบถูก (memory + semantic search)
- [ ] "เพิ่มงาน ทดสอบระบบ วันนี้" → "งานของผมวันนี้" → เห็นงาน → "ทำเสร็จแล้ว ทดสอบระบบ"
- [ ] "เตือนฉันอีก 5 นาทีให้ดื่มน้ำ" → รอ LINE push (ต้องตั้ง Step 7 ก่อน)
- [ ] "ติดตามข่าว AI" → พรุ่งนี้ 07:00 ได้ Daily Brief พร้อมข่าว
- [ ] Supabase Table Editor → ตาราง `conversations`, `memories`, `todos`, `reminders` มีข้อมูล
- [ ] Supabase → ตาราง `users` → ตัวเองมี `is_active = true`, `role = OWNER`
- [ ] ลองให้คนอื่น (ไม่อยู่ใน whitelist) ทัก → ถูกปฏิเสธ
- [ ] Vercel → Logs → ไม่มี error สีแดง
