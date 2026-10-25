# แผน: POS — ลูกค้าหน้าร้าน / ลูกค้าจอง

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POS เปิดบิลได้ 2 เส้นทาง: ลูกค้าหน้าร้าน (flow เดิมทุกอย่าง) และลูกค้าจอง (บิลจองล่วงหน้า 7 วัน, กรอกชื่อลูกค้า + ผู้รับจอง, ไม่มีขั้นเลือกหมอ — ตั้งหมอทีหลังที่การ์ดบิลที่เปิดอยู่ ก่อนเช็คบิล)

**Architecture:** บิลจอง = บิล open ธรรมดา + ฟิลด์ใหม่ 4 ตัว (`customerType/bookedDate/bookerName/bookerId`) โดยหมอระดับบิลเว้นว่างได้ ทุกมุมมองคำนวณวันธุรกิจของบิลด้วยฟังก์ชันตัวเดียว (`billBizDay`) การ์ดบิลที่เปิดอยู่แสดงบิลจองเป็นกลุ่มของตัวเอง กรองด้วยชิปเลือกวันเดิม พร้อม modal ตั้งหมอ

**Tech:** React 18 + Vite PWA, plain CSS, Supabase (migration รัน manual ใน SQL Editor)

**Spec:** `docs/superpowers/specs/2026-10-26-pos-booking-bill-design.md` — อ่านก่อนทำงาน

## Global Constraints

- โปรเจกต์ไม่มี test suite และไม่ติดตั้ง test framework — ตัวตรวจหลักคือ `npm run build` (ตาม AGENTS.md) รวมตรวจ manual ตามรายการ Task 7
- วัน/เวลาธุรกิจให้ผ่าน `src/utils/bkk.js` เสมอ: `bkkToday(i)` วันอนาคต i วัน, `bizToday()` วันธุรกิจวันนี้, `bkkNow()` timestamp — ห้ามใช้ `new Date()` นับวันธุรกิจเอง
- CSS แบบเดิม (plain CSS) — ใช้ class เดิมให้มากที่สุด เพิ่ม CSS ใหม่น้อยที่สุด
- Commit: conventional commits ภาษาไทย เช่น `feat(pos): …`, `feat(bills): …`
- บิลจองเป็นงานฝั่ง POS ล้วน — ห้ามแตะ `src/booking/BookingBillsSection.jsx`, `bookingAdminApi`, `supabase/functions/*`, `migration_auth_rls.sql`
- บิลจอง: หมอเว้นว่างได้ · เช็คบิลต้องมีหมอก่อน · ยอดบนวันให้บริการ (`bookedDate`) ไม่ใช่วันที่เปิดบิล
- ชิปวันสูงสุด = วันนี้ + 7 วัน (`bkkToday(0..7)`) — POS ไม่บล็อกวันปิดร้าน (พนักงานตัดสินเอง ต่างจากเว็บจอง)
- ห้ามรัน SQL ต่อ Supabase จากแผนนี้ (ผู้ใช้รันเอง Task 7)
- ไม่ bump version ในแผนนี้

## Review Focus

สิ่งที่ไม่มีดักตัวเองตอน build และง่ายหลุด ต้องตรวจ manual:

1. **ยอดวัน** — บิลจองวันพรุ่งนี้ห้ามนับเป็นยอดวันนี้ (ดาชบอร์ด/คอมมิชชัน/สเตตเมนต์) — เปลี่ยนวันธุรกิจด้วย `billBizDay` ให้ครบทุก call site (Task 2) ตรวจ Task 7 ✓2
2. **บิลจองไม่มีหมอ** — กันเช็คบิล (Task 4) ตรวจ Task 7 ✓4
3. **ข้อมูลจองไม่ครบ** (ลูกค้า/ผู้รับจอง ว่าง) — กันทั้งตอนเปิด (Task 3) และตอนแก้ไข (Task 5)
4. **DB เก่า** — sync บิลจองก่อนรัน SQL ต้องไม่ crash (ฟิลด์ตัด + banner) หลังรันครบเต็ม (Task 7 ✓5)
5. **Walk-in regression** — เปิด/แก้/ยกเลิก/รวมบิล/เช็คบิล เหมือนเดิมเป๊ะ (Task 7 ✓1)
6. **เว็บจองวันอนาคต POS มองไม่เห็น** (พนักงานไม่มีรหัสเจ้าของ) — ยอมรับแล้ว ตามข้อจำกัด (Task 7 ✓6)

---

### Task 1: ฟิลด์บิลจองบน sync + migration SQL

**Files:**
- Create: `supabase/migration_pos_booking_bill.sql`
- Modify: `src/data/cloudSync.js` — `toBillRow` (~L59-81), `fromBillRow` (~L124-146), `BILL_DROP_KEYS` (~L150-153)

**Interfaces:**
- Produces: บิลฝั่ง client มีฟิลด์: `customerType ('walkin'|'booking', ขาด = 'walkin')`, `bookedDate ('YYYY-MM-DD'|'')`, `bookerName (string)`, `bookerId (string)` — ซิงก์คู่คอลัมน์ DB `customer_type / booked_date / booker_name / booker_id` (text)

- [x] **Step 1: สร้าง SQL** — หัวไฟล์คอมเมนต์ลอกสไตล์ `migration_bill_fields.sql` (ต้องรันเองใน SQL Editor, idempotent, ก่อนรันแอปยังเซฟได้แบบลดรูป) เนื้อหา 4 บรรทัด:

```sql
alter table public.bills add column if not exists customer_type text not null default 'walkin';
alter table public.bills add column if not exists booked_date text not null default '';
alter table public.bills add column if not exists booker_name text not null default '';
alter table public.bills add column if not exists booker_id text not null default '';
```

- [x] **Step 2: `toBillRow`** เพิ่ม 4 คีย์: `customer_type: b.customerType || 'walkin'`, `booked_date: b.bookedDate || ''`, `booker_name: b.bookerName || ''`, `booker_id: b.bookerId || ''`
- [x] **Step 3: `fromBillRow`** เพิ่ม: `customerType: r.customer_type || 'walkin'`, `bookedDate: r.booked_date || ''`, `bookerName: r.booker_name || ''`, `bookerId: r.booker_id || ''`
- [x] **Step 4: `BILL_DROP_KEYS`** เพิ่ม 4 สตริง `'customer_type', 'booked_date', 'booker_name', 'booker_id'`
- [x] **Step 5: `npm run build`** → PASS
- [x] **Step 6: commit** `feat(bills): sync ฟิลด์บิลจอง (ประเภทลูกค้า/วันที่ให้บริการ/ผู้รับจอง) + migration SQL`

---

### Task 2: `billBizDay` + ใช้ทุกมุมมองเดิม

**Files:**
- Modify: `src/lib/billing.js` — เพิ่ม export + แทนจุดใช้ภายในไฟล์ (บรรทัดที่คำนวณวันของ bill: ~L161, ~L186)
- Modify call sites: `src/components/OpenBills.jsx` (~L166 `billDayOf`, ~L589 `dayKey`), `src/pages/PageBills.jsx` (~L96), `src/pages/PageCommission.jsx` (~L84), `src/components/MonthStatement.jsx` (4 จุด — จุด `ts` timestamp คงเดิม), `src/pages/PageDashboard.jsx` (~L98), `src/pages/PagePOS.jsx` (~L345)

**Interfaces:**
- Consumes: `bizDateOf` (มี import แล้วในไฟล์ที่เกี่ยว)
- Produces: `billBizDay(b) → 'YYYY-MM-DD'` — `b.customerType === 'booking' && b.bookedDate ? b.bookedDate : bizDateOf(b.date || b.createdAt || '')`

- [x] **Step 1: เพิ่มฟังก์ชัน** ใน `src/lib/billing.js` ใกล้ `billTotal`:

```js
// วันธุรกิจที่ "มีผล" ของบิล — บิลจอง (customerType 'booking') ใช้วันให้บริการ (bookedDate) ทุกสถานะ
// open/paid/cancelled กันบิลจองวันพรุ่งนี้ไหลไปยอดวันนี้ · บิลอื่นใช้กติกาเดิม
export function billBizDay(b) {
  if (!b) return '';
  if (b.customerType === 'booking' && b.bookedDate) return b.bookedDate;
  return bizDateOf(b.date || b.createdAt || '');
}
```

- [x] **Step 2: แทน call site ทุกจุด** ที่ระบุใน Files — ให้การหา "วันธุรกิจของบิล" ใช้ `billBizDay(b)` ทั้งหมด (`OpenBills`: `billDayOf` เปลี่ยนเป็น `(b) => billBizDay(b)`; `PagePOS` จุดกรองบิลคำนวณคิว ~L345 ใช้ `billBizDay(b) === bizToday()` — หลังจุดนี้บิลจองของวันอื่นจะไม่ถูกนับเป็นบิลวันนี้ ซึ่งตั้งใจแล้ว: คิวจองของวันอื่นจัดการเฉพาะ memo ใน Task 3 Step 3.11)
- [x] **Step 3: ตรวจ** — `grep -rn bizDateOf src` ควรเหลือแค่นิยามใน `bkk.js` + `billing.js` (ตัว implement) — ทุก file อื่นควรผ่าน `billBizDay`
- [x] **Step 4: `npm run build`** → PASS
- [x] **Step 5: commit** `refactor(bills): วันธุรกิจที่มีผล (billBizDay) ใช้เดียวกันทุกมุมมอง`

---

### Task 3: POS wizard — เลือกประเภทลูกค้า + flow บิลจองครบ

**Files:**
- Modify: `src/pages/PagePOS.jsx` (state + JSX wizard + openBill)
- Modify: `src/booking/bookingUtils.js` — export `TH_WD`, `TH_MO`, `dayChipLabel` (โคลนตรงตัวจาก `OpenBills.jsx` L23-L34 รวม fix `Date.UTC` กัน TZ เครื่อง)

**Interfaces:**
- Consumes: `data.attendance?.[bizToday()]` (map `therapistId → { at, by }` — สำหรับลิสต์ "หมอที่เช็กชื่อวันนี้"), `therapistsList`, ของเดิม: `pickedServices`, `addPickedService`, `chainTimes`, `TimeSlotPicker`, `slotState`, `nextFreeFrom`, `webBookings`
- Produces: บิลจองจาก `openBill` มีฟิลด์:
  - `customer: customerName.trim()`, `customerType: 'booking'`, `bookedDate: bizDate`
  - `bookerName: bookerName.trim()`, `bookerId` (เลือกจากหมอ = `t.id`, พิมพ์เอง = `''`)
  - `therapistId: ''`, `therapistName: ''`, `fuel: 0`
  - `items` ทุกแถว `therapistId: ''`, `therapistName: ''` (เวลา/ราคาเดิมทุกอย่าง)
  - walk-in เพิ่มเพียง `customerType: 'walkin'` อื่นเดิมทุกอย่าง
  - audit จอง: `action: 'เปิดบิลจอง (รอรับบริการ)'`, `detail: คุณ{ชื่อ} · {dayChipLabel(bizDate)} {HH:mm} · รับจอง {bookerName}`

- [x] **Step 3.1: `bookingUtils.js`** — เพิ่ม export `TH_WD`, `TH_MO`, `dayChipLabel(d)` — ผลต้องตรงกับฉบับ OpenBills: วันนี้ → `วันนี้`, วันอื่น → `จันทร์ 27 ต.ค.` (คำนวณ weekday ด้วย `Date.UTC` กัน TZ เครื่อง)
- [x] **Step 3.2: state ใหม่** — `customerType` (`null` เริ่มต้น / `'walkin'` / `'booking'`), `bizDate` (default `bkkToday()`), `customerName`, `bookerName`, `bookerId` (string ทั้งชุด default `''`)
- [x] **Step 3.3: หน้าเลือกประเภท (ขั้น 0)** — แสดงเมื่อ `customerType === null` (ซ่อนแถบขั้น 1-5) ให้ 2 ปุ่มขนาดใหญ่: `ลูกค้าหน้าร้าน` (icon `Store`), `ลูกค้าจอง` (icon `CalendarDays`) + hint บรรยาย flow สั้น ๆ; CSS ก้อนใหม่ชื่อ `.typepick-*` (รูปร่างใกล้เคียงการ์ด `dur-card` เดิม), เขียนใน `src/index.css`
- [x] **Step 3.4: `startFlow(t)`** — `setCustomerType(t); setStep(1); setErr('')` — walk-in ขั้น 1 = รายการ (JSX เดิม), booking ขั้น 1 = ชื่อลูกค้า
- [x] **Step 3.5: แถบขั้นต่อ flow** — labels walk-in `['รายการ','ระยะเวลา','หมอนวด','เวลา','ตรวจสอบ']`, booking `['ชื่อลูกค้า','รายการ','ระยะเวลา','เวลา','ตรวจสอบ']` — เมื่อ `customerType === 'booking'` ให้แถบขั้น/หัวการ์ดแสดงป้าย `ลูกค้าจอง` ชัดเจน
- [x] **Step 3.6: ขั้นจอง 1 ชื่อลูกค้า + รับจองโดย** (JSX เงื่อนไข `step === 1 && customerType === 'booking'`):
  - field `ชื่อลูกค้า` → `setCustomerName`
  - block `รับจองโดย`: ลิสต์ chip จาก `therapistsList.filter(t => (data.attendance?.[bizToday()] || {})[t.id])` แตะ → `setBookerId(t.id); setBookerName(t.name)`; + `input` `พิมพ์ชื่ออิสระ` (placeholder: ชื่อเจ้าของร้าน/พนักงาน ไม่ต้องเป็นหมอทะเบียน) พิมพ์ → `setBookerName(value)`, ถ้า value ต่างจาก chip ที่เซ็ตไว้ → `setBookerId('')`
  - ถ้าวันนี้ไม่มีใครเช็กชื่อ → ข้อความ `วันนี้ยังไม่มีใครเช็กชื่อ — พิมพ์ชื่อได้เลย`
  - ปุ่ม `← เปลี่ยนประเภทลูกค้า` กลับขั้น 0 — ถ้ามีข้อมูล (`customerName/bookerName/pickedServices`) ให้ `confirmDialog` ยืนยันก่อน reset
- [x] **Step 3.7: nav ขั้นจอง 1** — ปุ่ม `ถัดไป →` disabled จน `customerName.trim() && bookerName.trim()`; และใน `onClick` ตรวจซ้ำ — ถ้าไม่ครบให้ `setErr('กรอกชื่อลูกค้าและผู้รับจองให้ครบก่อน')` แล้วไม่ไปต่อ
- [x] **Step 3.8: JSX ขั้น อื่น ใช้เลขขั้นตาม flow** — จองใช้เลขขั้นเลื่อน: จองขั้น 2 = รายการ (JSX เดิมของขั้น 1), จองขั้น 3 = ระยะเวลา (JSX เดิมขั้น 2) โดยหมายเหตุ (walk-in ขั้น 3 = หมอนวด) — เงื่อนไข render: `step === (customerType === 'booking' ? 2 : 1)` สำหรับ รายการ / `step === (customerType === 'booking' ? 3 : 2)` สำหรับ ระยะเวลา และขั้นหมอนวดของ walk-in คงเงื่อนไข `step === 3 && customerType === 'walkin'`
- [x] **Step 3.9: nav ต่อขั้น แยกตาม flow** — `addPickedService` (จบขั้นระยะเวลา): walk-in คงพฤติกรรมเดิมเป๊ะ, booking `setStep(4)`; ปุ่ม `+ เพิ่มรายการ` (บนขั้นเลือกเวลา): walk-in คงเดิม, booking `setStep(2)`; ปุ่ม `← กลับ` (ขั้นเลือกเวลา): walk-in คงเดิม, booking `setStep(3)`; ปุ่ม `+ เพิ่มบริการ` (ขั้นตรวจสอบ): walk-in `setStep(1)`, booking `setStep(2)`
- [x] **Step 3.10: ขั้นเวลาจอง: ชิปวันที่ให้บริการ** — เหนือ `TimeSlotPicker` เพิ่มแถว 8 ชิป (`bkkToday(0..7)` + `dayChipLabel`); เลือก → `setBizDate(d)`; ไม่ต้อง reset เวลา (ตัว auto-snap ในขั้น 3.11 จะขยับให้ถ้าชน)
- [x] **Step 3.11: slot จอง: กันทุกคิวของวันนั้น** — สร้าง memo `bookedAllDay`: ช่วง `[start, end + 15 นาที)` จากบิล open ที่ `billBizDay(b) === bizDate` (อ่านเวลาจาก bill-level `startTime/endTime` ก่อน หากไม่มีค่อยใช้ระดับแถวตามโมเดลเก่า) + เมื่อ `bizDate === bizToday()` รวมคิวเว็บจองยืนยัน (ใช้วิธีเดิมของ PagePOS ที่แทรก `webBookings` ลง `slotState`) แบบช่วงเดียวกัน; ฟังก์ชัน `bookedSlotState(t)`: `t < OPEN_MIN || t > LAST_START_MIN` → `oob`, overlap ช่วงใดใน `bookedAllDay` → `clash`, อื่น → ว่าง; `const chooserSlotState = (t) => customerType === 'booking' ? bookedSlotState(t) : slotState(t)` — ให้ `timeSlots` / `nextFreeFrom` / `timeError` ใช้ `chooserSlotState` แทน `slotState` ทุกจุดในขั้นเวลา (walk-in ได้ผลเดียวกับเดิม เพราะ chooser ส่งต่อ `slotState`)
- [x] **Step 3.12: review ของจอง + `openBill` จอง** — ในขั้น 5 เมื่อจอง: แถว `หมอ: ยังไม่ระบุ — ตั้งหมอเมื่อลูกค้าถึงร้าน` แทนเดิม; ซ่อนส่วนหมอวิ่ง/ค่าน้ำมัน; ปุ่มเปลี่ยน label `เปิดบิลจอง · ฿ …`; `openBill` แยก path (จอง): ตรวจเงื่อนไขที่จำเป็นตาม Interfaces ข้างบน (ไม่บังคับหมอ) + สร้างบิลพร้อม audit ที่ระบุ แล้ว reset (`resetAll` + `setCustomerType(null)` + alert + `onNavigate('bills')` เหมือนเดิม); `openDraftBill` walk-in ยังตรวจหมอเดิม
- [x] **Step 3.13: guard realtime ต่อ flow** — `isWizardActive`: walk-in `step >= 3 && step <= 5` (เดิม), booking `step >= 4 && step <= 5` — ช่วง guard active ห้าม realtime reload ทับ; ขั้นจอง 1-3 (กรอกข้อมูล) ไม่อยู่ใน guard — input ทั้งชุดอยู่บน local state จึงรีโหลดเบื้องหลังได้เหมือนเดิม; `resetAll` เพิ่ม: `setCustomerName(''); setBookerName(''); setBookerId(''); setBizDate(bkkToday()); setCustomerType(null)`
- [x] **Step 3.14: ตรวจ + commit** — `npm run build` → PASS → `feat(pos): wizard เลือก ลูกค้าหน้าร้าน/ลูกค้าจอง + เปิดบิลจองล่วงหน้า`

---

### Task 4: OpenBills — กลุ่มบิลจองที่ร้านรับเอง + ปุ่มตั้งหมอ + กันเช็คบิลไม่มีหมอ

**Files:**
- Modify: `src/components/OpenBills.jsx` — บล็อกแยกบิลเปิด (~L164-168 รอบ `billDayOf`), JSX กลุ่มหน้าร้าน (~L655-763), `startCheckoutBill` (~L425), state กลุ่ม modal แก้ไข (~L230-240)
- Consumes: `billBizDay` (Task 2), `TH_WD/TH_MO/dayChipLabel` จาก `bookingUtils` (Task 3)

**Interfaces:**
- การ์ด "บิลที่เปิดอยู่" แสดงกลุ่มใหม่ `จอง (ร้านรับเอง)` ต่อจากกลุ่ม หน้าร้าน อยู่ก่อน `{children}` (BookingBillsSection เดอร์จองเว็บ)
- state ใหม่ที่นิยาม: `assignTarget` (บิลที่จะตั้งหมอ), `assignSeg` (`'regular'|'visiting'`), `assignName` (รหัสหมอประจำหรือชื่อหมอวิ่ง)
- ข้อกำหนดพฤติกรรม: ตั้งหมอสำเร็จ = ทั้ง bill-level `therapistId/therapistName` **และ item ทุกแถว** ได้ค่าเดียวกัน + `fuel: 30` เฉพาะหมอวิ่ง (ไม่สัมผัสกลไก guarantee — บันทึกเป็นบิลปรกติเท่านั้น)

- [x] **Step 4.1: แยกกลุ่มบิลเปิด** — รากคือ `allOpenBills` เดิม (bills status open):

```js
const walkBills = allOpenBills.filter((b) => b.customerType !== 'booking');
const ownBookingBills = allOpenBills.filter((b) => b.customerType === 'booking');
const openBills = dayFilter ? walkBills.filter((b) => billBizDay(b) === dayFilter) : walkBills;
const shownBookBills = dayFilter ? ownBookingBills.filter((b) => billBizDay(b) === dayFilter) : ownBookingBills;
```

หมายเหตุ (สำคัญ): `mergeSel`/`walkRowsSorted`/จำนวน count ที่เดิมอิง `openBills` — หลังแยกแล้ว `openBills` = หน้าร้านอย่างเดียว ต้องตรวจจุดใช้ทุกจุดว่าควรยังเป็น "หน้าร้านเท่านั้น" (โดยเฉพาะ merge: ห้ามรวมบิลจอง) ถ้ามีจุดที่ควรครอบทั้ง 2 กลุ่ม (เช่น openCount ใน tab) ให้ใช้ `allOpenBills`

- [x] **Step 4.2: กลุ่ม JSX ใหม่ `osec osec-green`** — ใส่ต่อกลุ่มหน้าร้านก่อน `{children}`: header icon `UserRound` + `<h2>จอง (ร้านรับเอง)</h2>` + count; แถวต่อบิล โคลนรูป `orow` ของหน้าร้าน: pill `จอง`; `orow-time` จาก `b.startTime || b.start_time`; `orow-svc` บริการแรก (+`+N`); `small` = `รับจองโดย {b.bookerName || '—'} · {b.customer}`; badge `รอตั้งหมอ` กรณีไม่มีหมอ; `orow-cta` รวมยอด + ปุ่ม set หมอ
- [x] **Step 4.3: ปุ่มตั้งหมอ** — แถวบิลจองที่ **ไม่มีหมอ** (ตรวจทั้ง `b.therapistId` และแถวแรกของ items): ปุ่ม icon `UserRound` ชั้นเดียวกับปุ่มอื่นของแถว (แก้ไข/ลบ) → `setAssignTarget(b)` เปิด modal (Step 4.4); แถวที่มีหมอแล้ว: ห้ามปุ่ม (แก้ไขผ่าน modal แก้ไขบิล)
- [x] **Step 4.4: modal ตั้งหมอ (ใหม่แยกจาก modal แก้ไข)** — โครงเดียวกับ Modal ที่มี:
  - `seg` `หมอประจำ` / `หมอวิ่ง` (`assignSeg`)
  - หมอประจำ: ปุ่มชื่อ/avatar จาก `data.therapists` active ทุกคน (แตะเลือก → `assignName = t.id`)
  - หมอวิ่ง: input ชื่ออิสระ (`assignName = ชื่อ`) — placeholder: `หมอวิ่ง รับบริการถึงบ้าน`
  - ปุ่ม `ยืนยันตั้งหมอ` disabled จน seg ประจำมี id / seg วิ่งมีชื่อ
  - **บันทึก:** bill-level + item ทุกแถว — หมอประจำ: `therapistId = t.id`; หมอวิ่ง: `therapistId = EXT-VIS-<ชื่อ>` (รูปแบบเดียวกับหมอวิ่งของ POS); `therapistName` = ชื่อ; `fuel: 30` เฉพาะหมอวิ่ง
  - audit: `action: 'ตั้งหมอบิลจอง'`, `detail: หมอ{therapistName} · คุณ{b.customer}`
  - เตือนชนเวลา (ไม่ block): คำนวณบิล open อื่นของวันจาก `billBizDay` (= assigned bookedDate) ที่ชนช่วงเวลาบิลจองเป้าหมาย + เดอร์เว็บจองเมื่อวันนี้ — ถ้าชนให้ `alertDialog` ข้อความ `ตั้งหมอเสร็จ — เวลาชนคิวของหมอคนนี้ ควรย้ายเวลาในแก้ไขบิล` (โดยบันทึกเสร็จไปแล้ว + ถ้าไม่ชนข้อความปรกติ `ตั้งหมอบิลจองเสร็จ` + ปิด modal)
- [x] **Step 4.5: กันเช็คบิลไม่มีหมอ** — ใน `startCheckoutBill` ตั้งกั้นหน้าเปิด modal ชำระ:

```js
if (b.customerType === 'booking' && !((b.therapistId || '') || (billRows(b)[0]?.therapistId || ''))) {
  alertDialog({ title: 'ตั้งหมอก่อนเช็คบิล', message: 'บิลจองต้องมีหมอก่อน — กดปุ่มตั้งหมอที่บิลจองก่อนเช็คบิล' });
  return;
}
```

(ยังไม่เพิ่ม modal ชำระ ไม่บันทึกอะไร)
- [x] **Step 4.6: DRY** — ลบ local `TH_WD/TH_MO/dayChipLabel` ของ `OpenBills.jsx` แล้ว import จาก `bookingUtils` — ตรวจ `grep -n "TH_WD" src`: นิยาม (สตริงต้นฉบับ) ต้องอยู่ที่เดียวใน `bookingUtils.js`, ไฟล์อื่นมีแค่ import
- [x] **Step 4.7: ตรวจ + commit** — `npm run build` → PASS → `feat(bills): การ์ดบิลเปิดอยู่แสดงบิลจองร้านรับเอง + ตั้งหมอ/กันเช็คบิล`

---

### Task 5: แก้ไขบิลจอง (ชื่อลูกค้า/ผู้รับจอง) + นับคิวจองรายวันในหน้าบิล

**Files:**
- Modify: `src/components/OpenBills.jsx` — state edit (~L230-240), `startEdit`, `saveEdit`/`saveEditAndCheckout` (~L386-423), `handleAddEditItem` (~L311-337), JSX modal แก้ไข
- Modify: `src/pages/PageBills.jsx` — merge dayCounts (`~L80-84`), modal รายละเอียด (`detailBill` ~L480), hint จอง (ถ้ามี `bookingsHint`)

**Interfaces:**
- modal แก้ไข: state เพิ่ม `editCustomer`, `editBooker` (ตั้งต้นจากบิล ณ `startEdit`, บิลหน้าร้านได้ `''`)
- กฎ bookerId: ถ้าเก็บชื่อผู้รับจองเท่าเดิม → รหัสเดิม; ถ้าแก้ชื่อ → `bookerId = ''` (คนจับโทรศัพท์อาจไม่ใช่เดิม)

- [x] **Step 5.1: state + modal fields** — `startEdit` เติม `setEditCustomer(b.customer || '')`, `setEditBooker(b.bookerName || '')`; JSX modal: เมื่อ `editTarget?.customerType === 'booking'` แสดง field `ชื่อลูกค้า` + `รับจองโดย` (โครง `field + input` เดิม)
- [x] **Step 5.2: validate + บันทึก** — ทั้ง `saveEdit` และ `saveEditAndCheckout` ขั้นแรก:

```js
if (editTarget.customerType === 'booking' && (!editCustomer.trim() || !editBooker.trim())) {
  setEditErr('บิลจองต้องมีชื่อลูกค้าและผู้รับจอง');
  return;
}
```

และใน `buildUpdatedBill` ส่วน bill: `customer: editCustomer.trim(), bookerName: editBooker.trim(), bookerId: (editBooker.trim() === (editTarget.bookerName || '') ? (editTarget.bookerId || '') : '')`
- [x] **Step 5.3: เพิ่มรายการในบิลจองที่ไม่มีหมอ** — `handleAddEditItem`: จุดเดิมที่ตรวจ "หมอเดิมของบิล" คงไว้สำหรับบิลหน้าร้าน แต่บิลจอง (`editTarget.customerType === 'booking'`) ให้แถวใหม่ `therapistId/therapistName = ''` (ไม่ error)
- [x] **Step 5.4: PageBills — นับคิวจองรายวัน** — ก่อนส่ง prop:

```js
const manualBkDayCounts = useMemo(
  () => (bills || []).reduce((acc, b) => {
    if (b && b.status === 'open' && b.customerType === 'booking') {
      const d = billBizDay(b);
      acc[d] = (acc[d] || 0) + 1;
    }
    return acc;
  }, {}),
  [bills]
);
```

สร้าง `computedDayCounts` (useMemo) = รวม `bkDayCounts` เดิม + `manualBkDayCounts` — รวม key ทุกวัน ค่า = เว็บจอง + POS บวกกัน; ส่ง `dayCounts={computedDayCounts}` เข้า `OpenBillsSection`; tab จำนวน (`openCount` — นับ open ทั้งหมด) นับถึงบิลจองอยู่แล้ว ไม่ต้องแก้
- [x] **Step 5.5: PageBills — modal รายละเอียด** — ต่อบล็อกแถวของ `detailBill`: เมื่อ `detailBill.customerType === 'booking'` เพิ่มแถว: `จอง (ร้านรับเอง)`, `วันที่ให้บริการ {dayChipLabel(detailBill.bookedDate || billBizDay(detailBill))}`, `รับจองโดย {detailBill.bookerName || '—'}` (import `dayChipLabel` จาก `../booking/bookingUtils`)
- [x] **Step 5.6: ตรวจ + commit** — `npm run build` → PASS → `feat(bills): แก้ไข/รายละเอียดบิลจอง + นับคิวจองรายวัน`

---

### Task 6: การ์ด "คิวที่จองล่วงหน้า" บนหน้า POS (spec §11)

**Files:**
- Modify: `src/pages/PagePOS.jsx` — JSX หลัก (หลัง err-banner ประจำ ก่อนหน้าเลือกประเภท); import `dayChipLabel` (Task 3)

**Interfaces:**
- Consumes: `data.bills` — บิลจอง open: `.filter((b) => b.customerType === 'booking' && b.status === 'open')` เรียง `bookedDate` ต่อ `startTime` (น้อยไปมาก)
- แถวแสดง: `dayChipLabel(bookedDate)` · `b.startTime || b.start_time` · `{b.customer}` · บริการแรก (+`+N`) · `รับจองโดย {b.bookerName || '—'}` · badge `รอตั้งหมอ` (เมื่อไม่มีหมอ) — แตะแถว → `onNavigate('bills')`

- [x] **Step 6.1: JSX การ์ด** — ใช้แนวการ์ดเดิมของ POS (Card/Hints/EmptyState ที่มีอยู่): head `คิวที่จองล่วงหน้า` + `{n} รายการ`; EmptyState `ยังไม่มีคิวที่จองไว้` เมื่อ `n === 0` — CSS ตาม class เดิม, เพิ่ม CSS ใหม่น้อยที่สุด (ถ้าต้องเพิ่ม ให้ชื่อ `.bkq-*`)
- [x] **Step 6.2: ตรวจ + commit** — `npm run build` → PASS → `feat(pos): การ์ดคิวที่จองล่วงหน้า`

---

### Task 7: ตรวจรวม + คู่มือรัน migration (verification-only)

**Files:** แก้จุดที่พบในการตรวจเท่านั้น (เรคอร์ดผลผ่านไม่ผ่าน)

- [ ] **Step 7.1: `npm run build`** → PASS
- [ ] **Step 7.2: สอนผู้ใช้รัน SQL ครั้งเดียว** — นำ `supabase/migration_pos_booking_bill.sql` ไป Supabase Dashboard → SQL Editor (idempotent รันซ้ำได้); หลังรัน ให้ reload แอป — ฟิลด์บิลจองครบ + banner เตือนหาย
- [ ] **Step 7.3: manual walkthrough** — `npm run dev` + `.env` Supabase จริง:

- **✓1 walk-in regression:** เปิดบิลหน้าร้านครบ flow → เช็คบิล/ยกเลิก/แก้ไข/รวมบิล เดิมเป๊ะ; ยอดดาชบอร์ด/คอมมิชชันของวันไม่แปลกจากเดิม
- **✓2 บิลจองข้ามวัน:** เปิดบิลจองพรุ่งนี้ — **ยอดดาชบอร์ดวันนี้ไม่เพิ่ม**; ในหน้าบิล กดชิปวันพรุ่งนี้ ต้องเห็นจำนวนจอง; เช็คบิลบิลจองแล้ว → ยอดใน "วันให้บริการ" ของบิล (และบนหน้าบิลค้นด้วย chip วันนั้น) นับถือวันเดียวกับ `bookedDate`
- **✓3 บิลจองข้อมูลไม่ครบ:** ขั้น 1 ไม่กรอกชื่อลูกค้า/ผู้รับจอง → ถัดไปค้าง/เตือน; แก้ไขบิลหลังเปิด → ห้ามบันทึกช่องว่าง (แจ้ง `บิลจองต้องมีชื่อลูกค้าและผู้รับจอง`)
- **✓4 กันเช็คบิล:** บิลจองที่ยังไม่ตั้งหมอ → กดเช็คบิลถูกบล็อก + ข้อความ `ตั้งหมอก่อนเช็คบิล`; ตั้งหมอแล้วเช็คบิลได้ปรกติ
- **✓5 sync ก่อน/หลัง SQL:** ก่อนรัน migration: เปิดบิลจองได้ไม่ crash (ฟิลด์ตัด + banner เตือน migration); รัน SQL แล้ว refresh — แถวบิลจองกลับมาครบทุกฟิลด์ banner หาย
- **✓6 เว็บจอง/ข้อจำกัด:** POS กันชนกับคิวเว็บจอง "ยืนยัน" ได้เฉพาะ **วันนี้** เท่านั้น (คิววันถัดไปของเว็บจอง พนักงานมองไม่เห็น — เจ้าของดูตารางเว็บจองแยก) — ถือเป็นข้อจำกัดที่ยอมรับแล้วตาม spec

- [ ] **Step 7.4: ปิดงาน** — ถ้าผ่านทั้งหมด: รายงานผู้ใช้พร้อมข้อความ: ผ่านมาแล้วเป็น commit chain `feat`/`refactor` ที่แตะเฉพาะไฟล์ในแผน ห้าม bump `package.json` ในแผนนี้; พร้อมบอกขั้นตอน release หากผู้ใช้ต้องการ: ผู้ใช้ bump `package.json` → `npm run build` → commit `chore(release)`

---

## สิ่งที่แผนนี้ไม่ครอบ (ไม่ต้องทำ)

- แตะ `BookingBillsSection.jsx` / `bookingAdminApi` / เดอร์จองเว็บ / `booking-admin` function / `migration_auth_rls.sql`
- ติดตั้ง test framework · แก้โมเดลรายละเอียดหมอวิ่งใหม่ · payment method ใหม่ · โปโมชั่นรูปแบบใหม่
- bump version / deploy / release ตามได้ข้างบน

## การส่งมอบ (Definition of Done)

- การ์ดฟีเจอร์ครบ Task 1–6, build PASS, commit chain ตามแต่ละ task
- SQL migration ถูกรันเรียบร้อย (งานผู้ใช้) และ ✓1–✓6 walkthrough ผ่านครบ
- แต่ละ checkbox ของทุก task ถูกติ๊กหลังจบขั้นนั้น ๆ ของสายงาน


