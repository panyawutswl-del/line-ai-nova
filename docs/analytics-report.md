# Nova Analytics Report — Google Analytics ของ sriwilaisukhothai.com

## Scope

ทุกวัน **จันทร์ / พุธ / ศุกร์ เวลา 09:00 น. (ไทย)** Nova ดึงสรุปรายงาน GA4 จาก
โปรเจกต์ `sriwilai-web` แล้วส่งเข้า LINE OA เดิม เป็น**ข้อความแยกอีกฉบับ** ไม่ปนกับ
Morning Brief 07:00

`sriwilai-web` เป็น endpoint ข้อมูลอย่างเดียว ไม่ยุ่งกับ LINE — Nova เป็นฝ่ายเรียกและส่ง

```text
cron-job.org (จ/พ/ศ 09:00 ไทย)
  └─ GET /api/cron/analytics-report   (Authorization: Bearer CRON_SECRET)
       └─ AnalyticsReportService
            └─ GET sriwilaisukhothai.com/api/analytics-report
                 (Authorization: Bearer ANALYTICS_REPORT_SECRET)
                 └─ LineService.pushText() → แชท Nova ของ owner
```

ข้อความที่ได้จาก endpoint (`text`) ถูกจัดบรรทัดมาพร้อมส่งแล้ว Nova ส่งต่อตามเดิม
ไม่ format ซ้ำ · ฟิลด์ `summary` ใน response ไม่ได้ถูกใช้

ผู้รับคือ `OWNER_LINE_USER_ID` คนเดียว (รายงานเว็บของเจ้าของ) — แบบเดียวกับ
[infrastructure alert](infrastructure-ups-on-battery.md) ไม่ได้ broadcast ให้ทุก user
ในระบบ

## Deploy configuration

เพิ่ม env var ใน Vercel (Production + Preview ถ้าจะทดสอบบน preview) แล้ว redeploy:

```text
ANALYTICS_REPORT_SECRET=<ค่าเดียวกับที่ตั้งไว้ในโปรเจกต์ sriwilai-web>
```

optional — ใช้ default อยู่แล้ว ตั้งเมื่อจะเปลี่ยน endpoint เท่านั้น:

```text
ANALYTICS_REPORT_URL=https://sriwilaisukhothai.com/api/analytics-report
```

`CRON_SECRET` และ `OWNER_LINE_USER_ID` ต้องตั้งไว้ก่อนแล้ว

> ⚠️ ค่า `ANALYTICS_REPORT_SECRET` ต้อง**ตรงกันเป๊ะทั้งสองโปรเจกต์** ถ้าไม่ตรง
> endpoint จะตอบ `401 {"error":"Unauthorized"}` แล้ว Nova จะไม่ส่งอะไรออก LINE

## ตั้งตารางเวลา

Vercel Hobby ให้ cron ได้ 2 job และรันได้วันละครั้ง — `vercel.json` ใช้โควตาครบแล้ว
(morning-brief + evening-wrapup) จึงตั้งผ่าน pinger ภายนอกเหมือน reminder dispatcher

[cron-job.org](https://cron-job.org) → **Create cronjob**:

- URL: `https://<app>.vercel.app/api/cron/analytics-report`
- Schedule → Custom: วันจันทร์, พุธ, ศุกร์ · เวลา **09:00**
  (ตั้ง timezone ของ job เป็น `Asia/Bangkok` ถ้าเลือกได้ ไม่งั้นใช้ **02:00 UTC**)
- Advanced → Headers: `Authorization: Bearer <CRON_SECRET>`

> ใช้ Vercel Pro? ข้าม cron-job.org แล้วเพิ่มใน `vercel.json`:
> `{"path": "/api/cron/analytics-report", "schedule": "0 2 * * 1,3,5"}`
> (02:00 UTC = 09:00 ไทย · Vercel cron ใช้ UTC เสมอ)

ตารางเวลาอยู่ที่ตัว pinger ไม่ใช่ในโค้ด — route ไม่ได้เช็ควันในสัปดาห์ ดังนั้น
`curl` ทดสอบวันไหนก็ส่งจริง

## ทดสอบ

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<app>.vercel.app/api/cron/analytics-report
```

| ผลลัพธ์ | แปลว่า |
| --- | --- |
| `{"ok":true,"sent":true}` | ส่งเข้า LINE แล้ว ✅ |
| `502 {"error":"unauthorized",...}` | secret ไม่ตรงกัน → เทียบ `ANALYTICS_REPORT_SECRET` ทั้งสองฝั่ง |
| `502 {"error":"not_configured",...}` | ยังไม่ได้ตั้ง `ANALYTICS_REPORT_SECRET` (หรือ `OWNER_LINE_USER_ID`) บน Vercel |
| `502 {"error":"empty_report",...}` | endpoint ตอบ 200 แต่ไม่มีฟิลด์ `text` |
| `502 {"error":"unknown",...}` | endpoint ตอบ error อื่น — `message` คือค่าที่ endpoint ส่งกลับมา |
| `502 {"error":"timeout"}` | endpoint ไม่ตอบใน 10 วินาที |
| `401 {"error":"unauthorized"}` | `CRON_SECRET` ของ Nova ผิด (คนละตัวกับ analytics secret) |

เช็ค endpoint ฝั่ง sriwilai-web แยกได้ด้วย:

```bash
curl -i -H "Authorization: Bearer <ANALYTICS_REPORT_SECRET>" https://sriwilaisukhothai.com/api/analytics-report
```

Vercel → Logs กรอง `analytics.` จะเห็น event: `analytics.report_sent`,
`analytics.unauthorized`, `analytics.timeout`, `analytics.empty_report`

## Security notes

- secret อยู่ใน env var เท่านั้น ห้าม commit — ทั้งสองโปรเจกต์
- ทั้ง 2 ชั้นใช้ Bearer header คนละค่ากัน: `CRON_SECRET` = ใครเรียก Nova ได้,
  `ANALYTICS_REPORT_SECRET` = Nova เรียก sriwilai-web ได้
- หลุดเมื่อไหร่ให้หมุนค่าใหม่พร้อมกันทั้งสองฝั่ง (ไม่งั้นจะได้ 401)
