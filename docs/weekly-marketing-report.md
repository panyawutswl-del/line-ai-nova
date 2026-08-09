# Nova Weekly Marketing Report — GA4 + Facebook + Instagram

## Scope

ทุกวัน **จันทร์ เวลา 09:00 น. (ไทย)** Nova ดึงสรุป **2 แหล่ง** จากโปรเจกต์ `sriwilai-web`
— GA4 (เว็บไซต์) + Facebook/Instagram — ส่งเข้า **Gemini** ให้สรุป + วิเคราะห์ + แนะนำ
เป็นภาษาไทยแบบกระชับ แล้วส่งเข้า LINE OA เป็น**ข้อความเดียว**

รายงานนี้ **เพิ่มเติม** จาก GA4 report เดิม (จ/พ/ศ) ไม่ได้แทนที่ — อันเดิมยังส่งตามปกติ

```text
cron-job.org (จันทร์ 09:00 ไทย)
  └─ GET /api/cron/weekly-marketing-report   (Authorization: Bearer CRON_SECRET)
       └─ WeeklyMarketingReportService
            ├─ GET sriwilaisukhothai.com/api/analytics-report  (Bearer ANALYTICS_REPORT_SECRET)
            ├─ GET sriwilaisukhothai.com/api/social-report     (Bearer ANALYTICS_REPORT_SECRET)
            ├─ GeminiService.generateText()  → สรุป+วิเคราะห์+แนะนำ (ไทย)
            └─ LineService.pushText() → แชท Nova ของ owner
```

ทั้งสอง endpoint เป็น data-only (ไม่ยุ่งกับ LINE) และใช้ **secret ตัวเดียวกัน**
(`ANALYTICS_REPORT_SECRET`) ผู้รับคือ `OWNER_LINE_USER_ID` คนเดียว

## Deploy configuration

**ไม่ต้องเพิ่ม env ใหม่** — ใช้ของเดิมที่ตั้งไว้แล้วทั้งหมด:

- `ANALYTICS_REPORT_SECRET` — ต้องตรงกับ `sriwilai-web` (มีอยู่แล้วจาก GA4 report)
- `GEMINI_API_KEY` — สำหรับวิเคราะห์ (มีอยู่แล้ว)
- `OWNER_LINE_USER_ID` — ผู้รับ (มีอยู่แล้ว)
- `CRON_SECRET` — ป้องกัน cron endpoint (มีอยู่แล้ว)

optional (มี default อยู่แล้ว ตั้งเมื่อจะเปลี่ยน endpoint เท่านั้น):

```text
SOCIAL_REPORT_URL=https://sriwilaisukhothai.com/api/social-report
ANALYTICS_REPORT_URL=https://sriwilaisukhothai.com/api/analytics-report
```

> ✅ เพราะ social-report ใช้ `ANALYTICS_REPORT_SECRET` ตัวเดียวกับ GA4 report
> Nova จึงเรียกได้ทันทีโดยไม่ต้องตั้ง secret เพิ่ม

## ตั้งตารางเวลา (cron-job.org)

Vercel Hobby ให้ cron 2 job (`vercel.json` เต็มแล้ว) จึงตั้งผ่าน pinger ภายนอกเหมือน
analytics-report

[cron-job.org](https://cron-job.org) → **Create cronjob**:

- URL: `https://<app>.vercel.app/api/cron/weekly-marketing-report`
- Schedule → Custom: **ทุกวันจันทร์ เวลา 09:00** (timezone `Asia/Bangkok`; ถ้าเลือกไม่ได้ใช้ **02:00 UTC**)
- Advanced → Headers: `Authorization: Bearer <CRON_SECRET>`

> ใช้ Vercel Pro? เพิ่มใน `vercel.json` แทน:
> `{"path": "/api/cron/weekly-marketing-report", "schedule": "0 2 * * 1"}`
> (02:00 UTC = 09:00 ไทย · จันทร์)

## ทดสอบ

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://<app>.vercel.app/api/cron/weekly-marketing-report
```

| ผลลัพธ์ | แปลว่า |
| --- | --- |
| `{"ok":true,"sent":true}` | ส่งรายงานเข้า LINE แล้ว ✅ |
| `502 {"error":"not_configured"}` | ยังไม่ได้ตั้ง `ANALYTICS_REPORT_SECRET` หรือ `OWNER_LINE_USER_ID` |
| `502 {"error":"empty_data"}` | ทั้งสอง endpoint ดึงข้อมูลไม่ได้ (เช็ก secret ให้ตรงทั้งสองโปรเจกต์) |
| `502 {"error":"gemini_failed"}` | Gemini error — `message` คือรายละเอียด (เช่น 429 quota) |
| `401 {"error":"unauthorized"}` | `CRON_SECRET` ผิด |

ตารางเวลาอยู่ที่ pinger ไม่ใช่ในโค้ด — route ไม่เช็ควันในสัปดาห์ ดังนั้น `curl` ทดสอบวันไหนก็ส่งจริง
