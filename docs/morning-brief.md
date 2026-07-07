# Daily Briefs — Morning & Evening (Phase 3)

Nova ส่งสรุปประจำวันให้ผู้ใช้ที่ active ทุกคนผ่าน LINE Push อัตโนมัติ วันละ 2 ครั้ง

| Brief | เวลา (Asia/Bangkok) | Cron (UTC) | Endpoint | Log event |
|---|---|---|---|---|
| ☀️ Morning Brief | 07:00 | `0 0 * * *` | `/api/cron/morning-brief` | `brief.morning_done` |
| 🌙 Evening Wrap-up | 20:00 | `0 13 * * *` | `/api/cron/evening-wrapup` | `brief.evening_done` |

ทั้งคู่ตั้งไว้ใน [vercel.json](../vercel.json) แล้ว · endpoint ป้องกันด้วย `CRON_SECRET` (Bearer header)

## ☀️ Morning Brief (07:00)

```
☀️ อรุณสวัสดิ์ คุณ{ชื่อ}

📅 กำหนดการวันนี้
• 10:00 ประชุมฝ่ายขาย

📋 งานวันนี้
🔴 ส่งรายงานประจำเดือน
🟠 ตามสัญญา OTA

⚠️ งานเกินกำหนด
• อัปเดตรูปห้องพัก

📰 ข่าวเด่น
📌 AI
• พาดหัวข่าวล่าสุด

🌤 อากาศสุโขทัย
29°C ☁️ เมฆมาก · สูงสุด 33° ต่ำสุด 26° · โอกาสฝน 37%
```

- **📅 กำหนดการ** — จาก Google Calendar (เฉพาะผู้ที่เชื่อมต่อแล้ว)
- **📋 งานวันนี้** — todo ที่ถึงกำหนดวันนี้ พร้อม icon ความสำคัญ (🔴 URGENT / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW)
- **⚠️ งานเกินกำหนด** — แสดงเมื่อมีเท่านั้น (สูงสุด 5 รายการ)
- **📰 ข่าวเด่น** — หัวข้อที่ผู้ใช้ติดตาม (ปิดได้ด้วย `newsEnabled`)
- **🌤 อากาศ** — Open-Meteo สำหรับพิกัดที่ตั้งใน env (ปิดได้ด้วย `weatherEnabled`)

## 🌙 Evening Wrap-up (20:00)

```
🌙 สรุปท้ายวัน — วันอังคารที่ 7 กรกฎาคม พ.ศ. 2569

✅ งานที่ทำเสร็จวันนี้
• ตอบอีเมลลูกค้า

📋 งานที่ยังเหลือ
🟠 ตามสัญญา OTA
🟢 วางแผนโปรโมชั่น

📅 กำหนดการพรุ่งนี้
• 10:00 ประชุมฝ่ายขาย

⏰ เตือนพรุ่งนี้
• 09:00 น. ประชุมทีม

📝 ลำดับความสำคัญแนะนำสำหรับพรุ่งนี้
1. ตามสัญญา OTA
2. วางแผนโปรโมชั่น
```

- **✅ งานที่ทำเสร็จ** — todo ที่ complete ตั้งแต่ 00:00 วันนี้
- **📋 งานที่ยังเหลือ** — todo ที่ยังเปิดอยู่ (สูงสุด 8 รายการ)
- **📅 กำหนดการพรุ่งนี้ / ⏰ เตือนพรุ่งนี้** — จากปฏิทินและ reminder
- **📝 ลำดับความสำคัญ** — เลือกจากงานที่เหลือ เรียงตามความสำคัญแล้วตามกำหนดส่ง top 3

## Per-user settings

ผู้ใช้เปิด/ปิดแต่ละส่วนได้เอง (ตาราง `user_settings`, ดู [Settings](#) ใน README):

| Setting | Default | ผลกับ brief |
|---|---|---|
| `morningBriefEnabled` | true | ข้ามสรุปเช้าถ้า false |
| `eveningBriefEnabled` | true | ข้ามสรุปเย็นถ้า false |
| `newsEnabled` | true | ตัดหมวดข่าวออก |
| `weatherEnabled` | true | ตัดพยากรณ์อากาศออก |
| `language` | th | สลับ label เป็น en |

พิมพ์ใน LINE: `settings` เพื่อดู · `ปิดสรุปเช้า` / `เปิดข่าว` / `english` เพื่อปรับ

## ความทนทาน (resilience)

- ผู้ใช้คนหนึ่งพัง **ไม่กระทบคนอื่น** — loop จับ error ต่อคน (`brief.send_failed`) แล้วไปต่อ
- Calendar / News / Weather ที่ล่ม → ตัดเฉพาะส่วนนั้น ไม่ทำให้ทั้ง brief ล้ม
- ผลลัพธ์ log เป็น `{ sent, skipped, failed }`

## ทดสอบด้วยตนเอง

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<app>.vercel.app/api/cron/morning-brief
# → {"ok":true,"sent":1,"skipped":0,"failed":0}

curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<app>.vercel.app/api/cron/evening-wrapup
```

> Vercel Hobby จำกัด cron รายวัน — 2 job นี้พอดีกับโควตา ถ้าต้องการความแม่นยำหรือ reminder แบบ near-real-time ให้ใช้ external pinger (ดู DEPLOYMENT_CHECKLIST.md)
