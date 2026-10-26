import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LayoutDashboard } from 'lucide-react';
import { Card, CardHead, PageHeader, DatePicker, inSingleDay, fmtDay } from '../components/ui';
// BUG-01/BUG-02 (reports): ใช้ตัวช่วยกลาง (billRows/rowNet/billTotal/billLinesOf) จาก billing.js
import { GUARANTEE_CATEGORY, applyGuaranteeForDate, guaranteeAmountOf, guaranteeSigOf, billTotal, billLinesOf, billBizDay } from '../lib/billing';
import { bkkToday, bizToday } from '../utils/bkk';
import MonthStatement, { buildMonthReport } from '../components/MonthStatement';
import { downloadMonthExcel } from '../lib/monthExcel';
// บิลจองลูกค้า (จบบริการ) นับรายได้/ค่าแรงด้วย — ฉีดเป็นบิลเสมือนตอนคำนวณ (data.bills จริงไม่แตะ)
import { getOwnerPass } from '../lib/auth';
import { bookingBillsOf, dataWithBookingBills, useCompletedBookings } from '../lib/bookingBills';

function localDay(offset = 0) {
  return bkkToday(offset);
}

// (ย้าย helper billRows/rowNet/billTotal/billLinesOf ไปใช้ตัวกลางใน billing.js)

export default function PageDashboard({ data, saveData }) {
  // วันธุรกิจตัดยอดตี 3 — หลังเที่ยงคืนถึงตี 3 ยังนับเป็นวันก่อนหน้า
  const today = bizToday();
  const [tab, setTab] = useState('day');
  const [filterDate, setFilterDate] = useState(today);
  const [stmtMonth, setStmtMonth] = useState(() => today.slice(0, 7));
  const [guaranteeMsg, setGuaranteeMsg] = useState('');
  // เดอร์ลูกค้าจองที่จบบริการ → นับรายได้/ค่าแรงเหมือนบิลหน้าร้าน (bookingBillsOf)
  const ownerKey = getOwnerPass(data?.ownerPass);
  const { bookings: completedBookings } = useCompletedBookings(ownerKey);
  const bookingBills = useMemo(
    () => bookingBillsOf(completedBookings, data.services, data.therapists),
    [completedBookings, data.services, data.therapists],
  );
  const paidBills = [
    ...((data.bills || []).filter((b) => b.status === 'paid')),
    ...bookingBills,
  ];
  // สำหรับรายงานรายเดือน (statement/excel) — ฉีดบิลจองแบบชั่วคราว data.bills จริงไม่ถูกแตะ
  const reportData = useMemo(
    () => dataWithBookingBills(data, completedBookings),
    [data, completedBookings],
  );

  // เติมรายจ่ายประกันอัตโนมัติเมื่อดูวันเดียว (tab รายวัน) — การ์ด loop แบบเดียวกับหน้าค่าแรง:
  const singleDay = tab === 'day' ? filterDate : null;
  const ensureSig = useRef('');
  const busyRef = useRef(false);
  const pendingRef = useRef(null);
  const runApply = (d, day) => {
    busyRef.current = true;
    return applyGuaranteeForDate(d, day).then((res) => {
      if (res && res.changed) {
        saveData(res.data);
        const parts = [];
        const added = (res.summary && res.summary.added) || [];
        if (added.length > 0) parts.push(`เติม ${added.map((t) => `${t.name} +฿ ${Number(t.shortfall).toLocaleString()}`).join(' · ')}`);
        const fixed = (res.summary && res.summary.fixed) || [];
        if (fixed.length > 0) parts.push(`ปรับลด ${fixed.map((f) => `${f.name} ฿ ${Number(f.from).toLocaleString()}→฿ ${Number(f.to).toLocaleString()}`).join(' · ')}`);
        if (parts.length > 0) setGuaranteeMsg(`ประกันมือ (${fmtDay(day)}): ${parts.join(' — ')} — ครบ ฿ ${guaranteeAmountOf(d).toLocaleString()}/คน`);
      }
    }).catch(() => { ensureSig.current = ''; }).finally(() => {
      busyRef.current = false;
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p && p.sig !== ensureSig.current) {
        ensureSig.current = p.sig;
        runApply(p.data, p.day);
      }
    });
  };
  // P2-2: reset toast ทุกครั้งที่เปลี่ยนวัน (กันข้อความค้างข้ามวัน)
  useEffect(() => { setGuaranteeMsg(''); }, [singleDay]);
  useEffect(() => {
    if (!singleDay) return;
    // P1-1: ใช้ helper กลาง guaranteeSigOf (อ่าน att/bills/expenses จาก data ล้วน กันอ่านค่าตัวเก่า)
    const sig = guaranteeSigOf(data, singleDay);
    if (ensureSig.current === sig) return;
    if (busyRef.current) { pendingRef.current = { data, day: singleDay, sig }; return; }
    ensureSig.current = sig;
    runApply(data, singleDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleDay, data]);

  // แยกยอดหมอประจำ / หมอวิ่ง (เฉพาะบิลชำระแล้ว) — M4: เช็กมาตรฐานที่เดียว (isFreelance)
  // BUG-01/BUG-02 (reports): ใช้ billLinesOf กลาง (ปันส่วนลดท้ายบิล + ลดค่าแรงตามส่วนลด)
  // ให้ยอดขาย/ค่าแรงตรงกับ MonthStatement (เอกสารทางการ) — เดิมไม่หักส่วนลดทำให้ยอดโป่ง
  const calcSplit = (bills) => {
    let regSales = 0, regComm = 0, extSales = 0, extComm = 0;
    bills.forEach((b) => billLinesOf(b, data.services, data.therapists).forEach((l) => {
      if (l.staff) { regSales += l.price; regComm += l.comm; }
      else { extSales += l.price; extComm += l.comm; }
    }));
    return { regSales, regComm, extSales, extComm };
  };

  // บิลนับตาม "วันที่ธุรกิจ" (00:00–02:59 = วันก่อนหน้า); รายจ่ายมีแค่วันที่นับตามปฏิทิน
  // P1-6: ใช้ billBizDay(b) ให้เหมือน billing.js / PageCommission / PageBills (บิลจองใช้วันให้บริการ, กันบิล date ว่างหลุด)
  const rangeBills = paidBills.filter((b) => inSingleDay(billBizDay(b), filterDate));
  const rangeSplit = calcSplit(rangeBills);
  const dayTotal = rangeBills.reduce((s, b) => s + billTotal(b), 0);
  // GUARANTEE (พิกัด frontend-agent: PageDashboard.jsx ใต้ rangeSplit/netToday) — กันนับซ้ำ:
  // expense หมวด 'ค่าประกันมือหมอ' หักออกจาก expenseSum แล้วบวกเข้า regComm (net นับครั้งเดียวฝั่ง regComm)
  const guaranteeToday = (data.expenses || [])
    .filter((e) => e.category === GUARANTEE_CATEGORY && inSingleDay(e.date, filterDate))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const expenseTodayRaw = (data.expenses || []).filter((e) => inSingleDay(e.date, filterDate)).reduce((s, e) => s + (e.amount || 0), 0);
  const expenseToday = expenseTodayRaw - guaranteeToday;
  const regCommAdj = rangeSplit.regComm + guaranteeToday;
  const freelanceToday = rangeSplit.extComm;
  // ยอดสุทธิ = รายได้ − รายจ่ายทั้งหมด(รายจ่ายไม่รวมประกันมือ + หมอวิ่ง + ค่าน้ำมัน) − ค่าแรงหมอ(รวมประกันมือ)
  const fuelToday = rangeBills.reduce((s, b) => s + (b.fuel || 0), 0);
  const expenseAllToday = expenseToday + freelanceToday + fuelToday;
  const netToday = dayTotal - expenseAllToday - regCommAdj;
  // M4: ช่องทางชำระสร้างจากข้อมูลจริง (dynamic) — รองรับวิธีจ่ายใหม่โดยไม่ต้อง hardcode
  const paySum = {};
  rangeBills.forEach((b) => {
    const m = b.paymentMethod || 'ไม่ระบุ';
    paySum[m] = (paySum[m] || 0) + billTotal(b);
  });
  const payLabels = Object.keys(paySum).sort((a, b) => paySum[b] - paySum[a]);

  const month = buildMonthReport(reportData, stmtMonth);

  return (
    <div>
      <PageHeader icon={LayoutDashboard} title="ภาพรวม" />

      <div className="seg">
        <button onClick={() => setTab('day')} className={tab === 'day' ? 'on' : ''}>รายวัน</button>
        <button onClick={() => setTab('month')} className={tab === 'month' ? 'on' : ''}>รายเดือน</button>
      </div>

      {tab === 'day' && (
      <>
      <DatePicker date={filterDate} onChange={setFilterDate} />
      {guaranteeMsg && singleDay && <div className="alert ok">{guaranteeMsg}</div>}

      <div className="hero-dark">
        <div className="hero-top"><span>สรุป {filterDate ? fmtDay(filterDate) : 'ทั้งหมด'}</span><span>{rangeBills.length} บิล</span></div>
        <div className="hero-net">฿ {Math.round(netToday).toLocaleString()}</div>
        <div className="hero-grid grid-3">
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(dayTotal).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(expenseAllToday).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอ</span><div className="hv">฿ {Math.round(regCommAdj).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="แยกตามประเภทหมอ" hint="ยอดขาย · ค่าแรง" />
        <div className="mini2">
          <div className="mini-box"><div className="l">หมอประจำ · ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.regSales).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">หมอประจำ · ค่าแรง</div><div className="v">฿ {Math.round(regCommAdj).toLocaleString()}</div></div>
          <div className="mini-box"><div className="l">หมอวิ่ง · ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.extSales).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">หมอวิ่ง · ค่าแรง</div><div className="v">฿ {Math.round(rangeSplit.extComm + fuelToday).toLocaleString()}</div></div>
        </div>
      </Card>
      </>
      )}

      {tab === 'month' && (
      <>
      <div className="field"><label>เดือน</label>
        <input type="month" value={stmtMonth} onChange={(e) => e.target.value && setStmtMonth(e.target.value)} className="input" />
      </div>

      <div className="hero-dark">
        <div className="hero-top"><span>สรุป{month.monthLabel}</span><span>{month.paidBills.length} บิล</span></div>
        <div className="hero-net">฿ {Math.round(month.net).toLocaleString()}</div>
        <div className="hero-grid grid-3">
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(month.income).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(month.expenseAll).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอ</span><div className="hv">฿ {Math.round(month.regComm).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="ใบสรุปประจำเดือน" />
        <div className="flex-gap-8">
          <button className="btn btn-primary auto fg1" onClick={() => window.print()}>PDF</button>
          <button className="btn btn-ghost auto fg1" onClick={() => downloadMonthExcel(reportData, stmtMonth)}>Excel</button>
        </div>
      </Card>
      </>
      )}
      {createPortal(<div className="print-only"><MonthStatement data={reportData} month={stmtMonth} /></div>, document.body)}
    </div>
  );
}
