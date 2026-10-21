# ifeew-thaimassadge

แอป POS ของร้าน I'FEEW Thai Massage (React 18 + Vite + PWA) — เครื่องมือฝั่งเจ้าของร้าน/พนักงาน

## หน้า "จองออนไลน์" (ใหม่)

หน้าจัดการการจองที่ลูกค้าทำผ่าน **เว็บจอง** (`ifeew-booking`) — ย้ายเข้ามาอยู่ในแอป POS แล้ว

- เมนู **"จองออนไลน์"** ในแถบเมนู (เฉพาะเจ้าของร้าน)
- ยิง Edge Function `booking-admin` ของโปรเจกต์ Supabase เดียวกัน (`x-admin-key`)
  — ยืนยันการโอน / ปฏิเสธ-ยกเลิก / ดูรูปสลีป / KPI สรุปวันนี้
- รีโหลดอัตโนมัติทุก 15 วินาที (หยุดตอนซ่อนแท็บหรือมี modal เปิดอยู่)

### ไม่ต้องตั้งค่าเพิ่ม — ใช้รหัสเจ้าของร้านตัวเดียวกับตอนเข้าระบบ

หน้า "จองออนไลน์" **ไม่มีหน้า login ซ้ำ** — เจ้าของร้านเข้าระบบ POS (บทบาท "เจ้าของร้าน") แล้วเข้าเมนูนี้ได้เลย
แอปส่งรหัสเจ้าของร้าน (`app_settings.owner_pass`) ไปเป็น `x-admin-key` ให้ Edge Function `booking-admin`
ซึ่งแก้ให้ยอมรับได้ทั้ง secret `BOOKING_ADMIN_KEY` และรหัสเจ้าของร้าน (ดู `ifeew-booking/supabase/functions/_shared/admin.ts`)

> ถ้าเจ้าของร้านเปลี่ยนรหัสผ่านในแอป → หน้า "จองออนไลน์" ใช้รหัสใหม่ทันที (sync ผ่าน cloud)

### ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/booking/BookingPage.jsx` | หน้าหลัก (รายการ + KPI + ตัวกรอง) |
| `src/booking/BookingFilters.jsx` | ตัวกรองวันที่ / สถานะ / ค้นหา |
| `src/booking/BookingKpi.jsx` | การ์ดสรุป 6 ช่อง |
| `src/booking/BookingList.jsx` · `BookingCard.jsx` | รายการ + การ์ดการจอง |
| `src/booking/BookingDialogs.jsx` | กล่องยืนยันโอน / ปฏิเสธ / ดูสลีป |
| `src/booking/bookingUtils.js` · `hooks.js` | helper + hooks (โหลดข้อมูล / action) |
| `src/lib/bookingAdminApi.js` | ตัวห่อเรียก `booking-admin` |
| `src/booking.css` | สไตล์ของหน้านี้ (import ใน `src/main.jsx`) |
