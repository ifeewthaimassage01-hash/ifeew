---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/index.css","src/pages/PagePOS.jsx","src/pages/PageBills.jsx","src/pages/PageDashboard.jsx"]
---

# Surface brief — I'FEEW POS (redesign ทั้งแอป)

## Direction contract

THESIS: แอปนี้พิสูจน์ว่า "งานเงินของร้านนวดต้องอ่านง่ายก่อนสวย" — หนีรูปแบบ admin-dashboard ที่กองทุกอย่างน้ำหนักเท่ากัน แทนด้วยหน้าจอทำงานก้อนเดียวจบต่อหน้า และอ่านชัดตั้งแต่จอ 390px

OWN-WORLD: โลกครีม–เบจเดิม (ground #f7f2e9, brown ink) + Kanit / Sarabun + การ์ดขอบนุ่ม แต่คุมความหนาแน่นด้วย type ladder ไม่เกิน 6 ขั้น (11.5–28px) และชุดสถานะเดียวทั้งแอป: รอ = amber, สำเร็จ = green, ยกเลิก = slate, ผิดพลาด = red

STORY: พนักงานหยิบมือถือ เปิด POS แล้วจบงานเงินเดียว; เจ้าของเห็นตัวเลขเงินโดยไม่ต้องกางรายงานทุกครั้ง — ทุกการกระทำมีสถานะบอกชัด ทุกจุดกดไม่ต้องเล็ง

FIRST VIEWPORT: ล็อกอิน: โลโก้กลาง + ฟิลด์ PIN ใหญ่ + ปุ่มเดียว; POS: การ์ดตั้งบิลใหญ่กลางจอ ปุ่ม "เปิดบิลใหม่" อยู่โซนนิ้วโป้งด้านล่าง พร้อมบรรทัดสรุปวันนี้หนึ่งบรรทัดด้านบน

FORM: app-level structural overhaul ภายในโลกสีที่ยืนยัน (established world) — ตำแหน่ง 1 ของลำดับที่บรีฟยืนยัน; seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
