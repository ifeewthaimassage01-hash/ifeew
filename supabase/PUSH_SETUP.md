# Web Push แจ้งเตือนแอดมิน — วิธี deploy (เจ้าของกดเอง)

แอป + migration + functions เตรียมไว้ครบแล้ว เหลือขั้นตอนที่ต้องใช้สิทธิ์เจ้าของ
(Supabase Dashboard / cron) ตามลำดับนี้

## 1. รัน migration ตาราง push_subscriptions

1. เปิด Supabase Dashboard > SQL Editor > New query
2. วางเนื้อหาไฟล์ `supabase/migration_push.sql` ทั้งหมด > Run
3. รันซ้ำได้ (idempotent) — เช็กว่ามีตาราง `push_subscriptions` แล้ว

## 2. ตั้ง secrets ของ Edge Functions

Dashboard > Project Settings > Edge Functions > Secrets (หรือ `supabase secrets set`):

- `VAPID_PUBLIC_KEY` = public key ตัวเดียวกับ `VITE_VAPID_PUBLIC_KEY` ใน `.env`
- `VAPID_PRIVATE_KEY` = **ดูในผลลัพธ์ที่ส่งให้เท่านั้น (ห้าม commit ลงไฟล์)**
- `VAPID_SUBJECT` = เช่น `mailto:เจ้าของ@ร้าน.com` (ไว้ติดต่อตามสเปก VAPID)
- `DAILY_KEY` = ตั้งรหัสยาวๆ เอง (เช่น สุ่ม 32 ตัว) ใช้ล็อก URL สรุปรายวัน
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` = มีให้อยู่แล้วใน Functions (ถ้าขาดค่อยเพิ่มเอง)

## 3. Deploy functions (2 ตัว)

บนเครื่องที่ login supabase CLI แล้ว:

```bash
supabase functions deploy push-bill
supabase functions deploy push-daily
```

URL จะได้รูป `https://xxx.supabase.co/functions/v1/push-bill`
กับ `https://xxx.supabase.co/functions/v1/push-daily`

## 4. Database Webhook — บิลใหม่ → push-bill

Dashboard > Database > Webhooks > Create webhook:

- Table: `bills`, Events: `INSERT` (ติ๊ก Insert อย่างเดียว)
- (แนะนำ) Condition: `status = 'paid'` — กันแจ้งเตือนบิลร่าง open
- URL: `https://xxx.supabase.co/functions/v1/push-bill`
- Method: POST — function return 200 เสมอพร้อม `{sent:n}`

ทดสอบ: เปิดบิลใหม่แบบ paid แล้วดูว่าเครื่องแอดมินที่กด "เปิดแจ้งเตือน" ได้รับไหม

## 5. Cron สรุปรายวัน — UptimeRobot เรียก push-daily

ใช้ UptimeRobot (keyword monitor) ตั้ง 1 ตัว:

- URL: `https://xxx.supabase.co/functions/v1/push-daily?key=DAILY_KEYที่ตั้งไว้`
- เวลา: ทุกวัน **23:05** (เวลาไทย)
- Keyword: `สรุปยอดวันนี้` (ถ้าไม่เจอ = แจ้งเตือนให้รู้ว่า cron ล้ม)

function จะคำนวณเอง (Asia/Bangkok): บิล paid วันนี้ = รายรับรวม/จำนวนบิล,
รายจ่ายวันนี้รวม — regComm ละเอียด (ค่าคอมรายคน/ประกันมือ) ดูในแอป

## 6. เปิด/ปิดแจ้งเตือน + ลบ subscription

- หน้า **จัดการร้าน** > การ์ด **แจ้งเตือนแอดมิน** > กดเปิด/ปิด (รายเครื่อง)
- ปิด = ลบ subscription เครื่องนั้นออกจาก `push_subscriptions` ทันที
- ลบทุกเครื่องด้วย SQL: `delete from public.push_subscriptions where role = 'owner';`
- เปลี่ยนเครื่องใหม่: เปิดแจ้งเตือนบนเครื่องใหม่ แล้วลบแถวเก่าออก
- หมายเหตุ iOS: ต้อง **Add to Home Screen (ติดตั้งลงหน้าจอหลัก)** ก่อนถึงเปิด Push ได้
