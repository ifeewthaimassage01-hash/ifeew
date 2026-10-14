// Monthly Excel export (CSV with BOM — opens correctly in Excel with Thai text).
import { buildMonthReport, fmtDay, fmtTime } from '../components/MonthStatement';

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n) => Math.round(n || 0);
const dt = (l) => `${fmtDay(l.date)}${l.ts ? ` ${fmtTime(l.ts)}` : ''}`;

export function downloadMonthExcel(data, month) {
  const r = buildMonthReport(data, month);
  const L = [];
  L.push([`I'FEEW THAI MASSAGE — ใบสรุปประจำเดือน ${r.monthLabel}`]);
  L.push([]);
  L.push(['สรุปยอด', 'จำนวน (บาท)']);
  L.push(['รายได้ทั้งหมด', num(r.income)]);
  L.push(['รายจ่าย', num(r.expenseSum)]);
  L.push(['ค่าแรงหมอประจำ', num(r.regComm)]);
  L.push(['ค่าแรงหมอวิ่ง (รวมค่าน้ำมัน)', num(r.extComm + r.fuelSum)]);
  L.push(['ยอดสุทธิ', num(r.net)]);
  L.push([]);
  L.push(['สรุปรายวัน']);
  L.push(['วันที่', 'บิล', 'รายได้', 'รายจ่าย', 'สุทธิ']);
  r.dayRows.forEach((d) => L.push([
    fmtDay(d.date), d.bills.size, num(d.income),
    num(r.expByDay[d.date] || 0), num(d.income - (r.expByDay[d.date] || 0) - d.comm),
  ]));
  L.push([]);
  L.push(['รายการขายรายตัว']);
  L.push(['วันที่–เวลา', 'บริการ', 'หมอ', 'ราคา', 'ค่าแรง', 'สุทธิ']);
  r.lines.forEach((l) => L.push([dt(l), l.service, l.therapist, num(l.price), num(l.comm), num(l.net)]));
  L.push(['รวมทั้งเดือน', '', '', num(r.income), num(r.regComm + r.extComm), num(r.income - r.regComm - r.extComm)]);
  L.push([]);
  L.push(['ช่องทางชำระ']);
  L.push(['ช่องทาง', 'บิล', 'ยอด']);
  Object.entries(r.paySum).forEach(([m, v]) => L.push([m, v.n, num(v.total)]));
  L.push([]);
  L.push(['ค่าแรงรายหมอ']);
  L.push(['หมอ', 'งาน', 'ยอดขาย', 'ค่าแรง']);
  r.therRows.forEach((t) => L.push([t.name, t.jobs, num(t.sales), num(t.comm)]));
  L.push([]);
  L.push(['รายการรายจ่าย']);
  L.push(['วันที่', 'รายการ', 'วิธีจ่าย', 'ยอด']);
  r.expenses.forEach((e) => L.push([
    fmtDay(String(e.date || '').slice(0, 10)),
    e.notes && e.notes !== e.item ? `${e.item} · ${e.notes}` : (e.item || ''),
    e.method || '', num(e.amount),
  ]));

  const csv = '﻿' + L.map((row) => row.map(cell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `statement-${month}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}
