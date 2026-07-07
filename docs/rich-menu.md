# LINE Rich Menu — Nova (Phase 3)

Rich Menu คือแถบเมนูปุ่มด้านล่างหน้าแชท LINE กดแล้วส่งคำสั่งลัด (Quick Command) ให้ Nova

## Layout

```
┌───────────────────────┬───────────────────────┐
│     📅 Calendar        │      ✅ Todo           │
├───────────────────────┼───────────────────────┤
│     ⏰ Reminder        │      📰 News           │
├───────────────────────┼───────────────────────┤
│     🧠 Memory          │      ⚙️ Settings       │
└───────────────────────┴───────────────────────┘
```

- ขนาดภาพ 2500 × 1686 px (6 ช่อง 1250 × 562)
- แต่ละปุ่มส่งข้อความคำสั่งล้วน (`calendar`, `todo`, `reminder`, `news`, `memory`, `settings`)
- ข้อความเหล่านี้ถูกดักโดย **QuickCommandService** → ตอบทันทีโดย **ไม่เรียก Gemini** (เร็ว + ประหยัดโควตา)

## Prerequisites

1. ตั้ง `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env` (ตัวเดียวกับที่ deploy)
2. ติดตั้ง dependencies แล้ว (`sharp` ใช้สร้างภาพเมนู)

## คำสั่ง

```bash
# สร้างเมนู + รูป + ตั้งเป็น default + สร้าง alias "nova-main"
npm run line:richmenu:create

# ลบ alias + เมนูทั้งหมด + ยกเลิก default
npm run line:richmenu:delete

# ตั้งเมนูล่าสุดเป็น default (ทุกคน)
npm run line:richmenu:link

# หรือ link เมนูให้ผู้ใช้คนเดียว
npm run line:richmenu:link -- U1234567890abcdef
```

รันครั้งเดียวก็พอ (เป็น global config ฝั่ง LINE ไม่เกี่ยวกับ deploy) หลังรัน `create` ให้ปิด–เปิดห้องแชท Nova เพื่อให้เมนูโผล่

## รูปเมนู

สคริปต์สร้างภาพเมนูอัตโนมัติด้วย `sharp` (rasterize SVG → PNG) — เป็นกริดสีอ่อน 6 ช่องพร้อม label
อยากใช้ภาพดีไซน์เองก็ได้: แก้ `buildImage()` ใน [scripts/richmenu.ts](../scripts/richmenu.ts) ให้อ่านไฟล์ PNG/JPEG ของคุณแทน (ต้องเป็น 2500×1686 หรือ 2500×843)

## Aliases

Rich Menu Alias ใช้สลับเมนูหลายชุด (เช่น เมนูแบบแท็บ) — Nova สร้าง alias `nova-main` ชี้ไปเมนูหลัก
ถ้าต่อยอด Phase ถัดไปเป็นเมนูหลายหน้า สามารถผูก action `richmenuswitch` กับ alias ได้

## Quick Commands (พิมพ์เองก็ได้)

ไม่ต้องมี Rich Menu ก็ใช้ได้ — พิมพ์คำเหล่านี้ตรง ๆ:

| พิมพ์ | ได้อะไร |
|---|---|
| `calendar` / `ปฏิทิน` | นัดหมายวันนี้ / ลิงก์เชื่อม Google Calendar |
| `todo` / `งาน` | งานวันนี้ + จำนวนงานค้าง |
| `reminder` / `เตือน` | รายการเตือนที่รอส่ง |
| `news` / `ข่าว` | หมวดข่าวที่ติดตาม |
| `memory` / `ความจำ` | สิ่งที่ Nova จำไว้ |
| `settings` / `ตั้งค่า` | แผงตั้งค่า + วิธีปรับ |

Toggle: `เปิด/ปิดสรุปเช้า`, `เปิด/ปิดสรุปเย็น`, `เปิด/ปิดข่าว`, `เปิด/ปิดอากาศ`, `english` / `ไทย`

## Troubleshooting

| อาการ | วิธีแก้ |
|---|---|
| เมนูไม่โผล่ | ปิด–เปิดห้องแชท Nova / ตรวจว่า `create` ตั้ง default สำเร็จ |
| `LINE_CHANNEL_ACCESS_TOKEN is not set` | ยังไม่มี `.env` หรือ token ว่าง |
| กดปุ่มแล้วเงียบ | ตรวจ webhook ทำงาน + ผู้ใช้อยู่ใน whitelist |
| อยากเปลี่ยนภาพ/ปุ่ม | แก้ `RICH_MENU_BUTTONS` ใน [services/rich-menu.service.ts](../services/rich-menu.service.ts) แล้ว `delete` + `create` ใหม่ |
