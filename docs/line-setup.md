# LINE Setup Guide — สร้างบอท Nova

## 1. สร้าง LINE Official Account

1. ไปที่ [LINE Developers Console](https://developers.line.biz/console/)
2. สร้าง **Provider** (ถ้ายังไม่มี) เช่น "Nova"
3. **Create a Messaging API channel**
   - Channel name: `Nova` (หรือชื่อที่ต้องการ)
   - Category / Subcategory: เลือกตามจริง
   - Region: Thailand

## 2. เก็บ credentials

| ค่า | อยู่ที่ |
|---|---|
| `LINE_CHANNEL_SECRET` | แท็บ **Basic settings** → Channel secret |
| `LINE_CHANNEL_ACCESS_TOKEN` | แท็บ **Messaging API** → Channel access token → **Issue** |

## 3. ตั้งค่า Messaging API

ในแท็บ **Messaging API**:

- **Webhook URL**: `https://<your-app>.vercel.app/api/webhook/line`
- **Use webhook**: ✅ ON
- **Verify**: กดทดสอบ ต้อง Success

ใน [LINE Official Account Manager](https://manager.line.biz/) → Settings → Response settings:

- **Chat (แชทสด)**: ❌ OFF
- **Auto-response messages (ข้อความตอบกลับอัตโนมัติ)**: ❌ OFF
- **Webhooks**: ✅ ON

> ถ้าไม่ปิด auto-response ผู้ใช้จะได้ข้อความซ้ำ 2 ชุด

## 4. Greeting message (แนะนำ)

Official Account Manager → Response settings → Greeting message — ปิดได้เลย เพราะบอทส่งข้อความต้อนรับเองตอน follow event

## 5. เพิ่มเพื่อน + ทดสอบ

1. สแกน QR code ในแท็บ Messaging API
2. ทักบอท → ครั้งแรกจะได้ LINE User ID กลับมา (เอาไปใส่ whitelist ตาม [deployment.md](deployment.md) ข้อ 6)
3. หลัง whitelist แล้ว ทักใหม่ → Nova ตอบด้วย Gemini ✅

## Rich Menu (Phase ถัดไป)

เมนู 📋 งานวันนี้ · 📅 Calendar · 🧠 Memory · ⏰ Reminder · 📰 News · ⚙️ More จะเพิ่มตอน Phase 2–3 เมื่อฟีเจอร์พร้อมใช้งานจริง
