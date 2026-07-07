# Deployment Guide — Nova (Supabase + Vercel)

## 1. Supabase — Database

1. สร้าง project ที่ [supabase.com](https://supabase.com) (region: Singapore `ap-southeast-1` ใกล้ไทยสุด)
2. ไปที่ **Project Settings → Database → Connection string**
3. เก็บ 2 ค่า:
   - **Transaction pooler** (port `6543`) → ใช้เป็น `DATABASE_URL` — ต่อท้ายด้วย `?pgbouncer=true&connection_limit=1`
   - **Session / Direct** (port `5432`) → ใช้เป็น `DIRECT_URL`
4. รัน migration จากเครื่อง (ใส่ค่าใน `.env` ก่อน):
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

> ⚠️ Vercel serverless + Supabase ต้องใช้ pooled connection (`6543`) ตอน runtime ไม่งั้น connection หมดเร็ว · ส่วน migrate ต้องใช้ direct (`5432`)

## 2. LINE Channel

ดู [line-setup.md](line-setup.md) — สุดท้ายจะได้ `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN`

## 3. Gemini API Key

1. ไปที่ [Google AI Studio](https://aistudio.google.com/apikey) → Create API key
2. Free tier ใช้ได้เฉพาะ `gemini-2.5-flash` (2.0-flash ติด quota=0, 1.5-flash deprecated)

## 4. Vercel

1. Push repo ขึ้น GitHub แล้ว import ที่ [vercel.com/new](https://vercel.com/new)
2. Framework preset: **Next.js** (auto-detect) — ไม่ต้องแก้ build command (`prisma generate` อยู่ใน build script แล้ว)
3. ตั้ง Environment Variables (Production):

   | Variable | Value |
   |---|---|
   | `LINE_CHANNEL_SECRET` | จาก LINE console |
   | `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE console |
   | `GEMINI_API_KEY` | จาก AI Studio |
   | `GEMINI_MODEL` | `gemini-2.5-flash` |
   | `DATABASE_URL` | pooled (6543) + `?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | direct (5432) |
   | `SUPABASE_URL` | Project Settings → API |
   | `SUPABASE_ANON_KEY` | Project Settings → API |
   | `OWNER_LINE_USER_ID` | LINE User ID ของคุณ (ได้จากขั้นตอนที่ 6) |
   | `WHITELIST_LINE_USER_IDS` | (optional) ID เพิ่มเติม คั่น comma |

4. Deploy → ได้ URL เช่น `https://nova-xxx.vercel.app`

## 5. เชื่อม Webhook

1. LINE Developers Console → channel → **Messaging API**
2. Webhook URL: `https://<your-app>.vercel.app/api/webhook/line`
3. กด **Verify** → ต้องขึ้น Success
4. เปิด **Use webhook** = ON

## 6. หา LINE User ID ของตัวเอง

1. เพิ่มบอทเป็นเพื่อน (QR code ในหน้า Messaging API) แล้วทักอะไรก็ได้
2. บอทจะตอบว่ายังไม่ได้รับอนุญาต **พร้อม LINE User ID ของคุณ** (ขึ้นต้นด้วย `U...`)
3. เอา ID ไปใส่ env `OWNER_LINE_USER_ID` บน Vercel → Redeploy
4. ทักอีกครั้ง → ระบบ activate อัตโนมัติ ✅

## Production checklist

- [ ] Webhook Verify ผ่าน
- [ ] ทักบอทแล้วได้คำตอบจาก Gemini
- [ ] คนที่ไม่อยู่ใน whitelist โดนปฏิเสธ
- [ ] ตาราง `conversations` มีข้อความเก็บครบ (ดูใน Supabase Table Editor)
- [ ] Vercel Logs ไม่มี error (`vercel logs` หรือ dashboard)
