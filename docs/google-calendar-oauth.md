# Google Calendar OAuth Guide — Nova

Nova เชื่อม Google Calendar แบบ per-user OAuth: ผู้ใช้แต่ละคนกดลิงก์อนุญาตเอง token เก็บในตาราง `settings` (key `google_oauth`) และ refresh อัตโนมัติ

## 1. สร้าง OAuth Client ใน Google Cloud

1. ไปที่ [console.cloud.google.com](https://console.cloud.google.com/) → สร้าง project ใหม่ (เช่น "nova-assistant")
2. **APIs & Services → Library** → ค้นหา **Google Calendar API** → **Enable**
3. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - กรอกชื่อแอป "Nova", support email
   - Scopes: เพิ่ม `https://www.googleapis.com/auth/calendar.events`
   - Test users: **เพิ่ม Gmail ของคุณ** (สำคัญ — ถ้าไม่เพิ่มจะ login ไม่ได้ตอนแอปอยู่ในโหมด Testing)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://<your-app>.vercel.app/api/auth/google/callback`
5. ได้ **Client ID** และ **Client Secret**

## 2. ตั้ง env บน Vercel

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | จากขั้นตอนที่ 4 |
| `GOOGLE_CLIENT_SECRET` | จากขั้นตอนที่ 4 |
| `GOOGLE_REDIRECT_URI` | `https://<your-app>.vercel.app/api/auth/google/callback` |

Redeploy หลังตั้งค่า

## 3. เชื่อมต่อ (ฝั่งผู้ใช้)

1. พิมพ์ใน LINE: **"นัดประชุมพรุ่งนี้ 10 โมง"** หรือ **"เชื่อม Google Calendar ให้หน่อย"**
2. Nova จะส่งลิงก์เชื่อมต่อมาให้ (ลิงก์มี signed state ผูกกับ LINE User ID — ปลอมไม่ได้)
3. กดลิงก์ → เลือกบัญชี Google → Allow → เห็นหน้า "✅ เชื่อมต่อสำเร็จ"
4. กลับไปสั่งใน LINE ได้เลย:
   - "นัดประชุมทีมพรุ่งนี้ 10 โมงถึงเที่ยง ที่ห้องประชุมใหญ่"
   - "Schedule dentist appointment Friday 3pm"
   - "อาทิตย์นี้มีนัดอะไรบ้าง"

## Flow ทางเทคนิค

```
LINE chat → tool create_calendar_event → ยังไม่เชื่อม → ตอบ connect_url
connect_url = /api/auth/google?state=<lineUserId>.<hmac>
  → verify state → redirect ไป Google consent (scope: calendar.events, access_type=offline)
  → Google redirect กลับ /api/auth/google/callback?code=...&state=...
  → แลก code เป็น access_token + refresh_token → เก็บใน settings table
ครั้งถัดไป: ใช้ access_token ตรง ๆ / refresh อัตโนมัติเมื่อหมดอายุ
```

## Troubleshooting

| อาการ | สาเหตุ/วิธีแก้ |
|---|---|
| `Error 403: access_denied` ตอน login | ยังไม่เพิ่ม Gmail เป็น Test user ใน consent screen |
| `redirect_uri_mismatch` | URI ใน Google Cloud ไม่ตรงกับ `GOOGLE_REDIRECT_URI` (ต้องตรงทุกตัวอักษร) |
| เชื่อมแล้วแต่สร้าง event ไม่ได้ | token หมดสิทธิ์ — พิมพ์ขอลิงก์ใหม่แล้วเชื่อมอีกครั้ง |
| แอปโหมด Testing token หมดอายุใน 7 วัน | ใน consent screen กด **Publish app** (ไม่ต้อง verify ถ้าใช้เอง) |
