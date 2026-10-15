import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LayoutDashboard } from 'lucide-react';
import { Card, CardHead, PageHeader, DateRange, inDateRange, fmtRange, fmtDay } from '../components/ui';
import { commBaht, isFreelance, GUARANTEE_CATEGORY, applyGuaranteeForDate, guaranteeAmountOf, guaranteeSigOf } from '../lib/billing';
import { bkkToday, bizDateOf, bizToday } from '../utils/bkk';
import MonthStatement, { buildMonthReport } from '../components/MonthStatement';
import { downloadMonthExcel } from '../lib/monthExcel';

function localDay(offset = 0) {
  return bkkToday(offset);
}

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
// สูตรยอดบิลมาตรฐานทั้งแอป (ตรงกับยอด total ที่เซฟ)
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));
// สูตรยอดสุทธิมาตรฐานทั้งแอป: net = income − expenseSum − extComm − fuelSum − regComm

export default function PageDashboard({ data, saveData }) {
  // วันธุรกิจตัดยอดตี 3 — หลังเที่ยงคืนถึงตี 3 ยังนับเป็นวันก่อนหน้า
  const today = bizToday();
  const [tab, setTab] = useState('day');
  const [dr, setDr] = useState({ from: today, to: today });
  const [stmtMonth, setStmtMonth] = useState(() => today.slice(0, 7));
  const [guaranteeMsg, setGuaranteeMsg] = useState('');
  const paidBills = (data.bills || []).filter((b) => b.status === 'paid');

  // เติมรายจ่ายประกันอัตโนมัติเมื่อดูวันเดียว (tab รายวัน) — การ์ด loop แบบเดียวกับหน้าค่าแรง:
  // strict ตรวจ created>0 ถึง saveData + ลายเซ็นข้อมูลกัน double-invoke เซฟซ้ำ
  const singleDay = tab === 'day' && dr.from && dr.from === dr.to ? dr.from : null;
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
  const calcSplit = (bills) => {
    let regSales = 0, regComm = 0, extSales = 0, extComm = 0;
    bills.forEach((b) => billRows(b).forEach((itm) => {
      const tid = itm.therapistId || b.therapistId;
      const net = itm.net ?? itm.price ?? 0;
      const qty = itm.qty || 1;
      const svc = (data.services || []).find((x) => x.id === itm.serviceId);
      const comm = svc ? commBaht(svc) * qty : 0;
      if (!isFreelance(tid, data.therapists)) { regSales += net; regComm += comm; }
      else { extSales += net; extComm += comm; }
    }));
    return { regSales, regComm, extSales, extComm };
  };

  // บิลนับตาม "วันที่ธุรกิจ" (00:00–02:59 = วันก่อนหน้า); รายจ่ายมีแค่วันที่นับตามปฏิทิน
  // P1-6: ใช้ bizDateOf(b.date||b.createdAt) ให้เหมือน billing.js / PageCommission / PageBills (กันบิล date ว่างหลุด)
  const rangeBills = paidBills.filter((b) => inDateRange(bizDateOf(b.date || b.createdAt), dr.from, dr.to));
  const rangeSplit = calcSplit(rangeBills);
  const dayTotal = rangeBills.reduce((s, b) => s + billTotal(b), 0);
  // GUARANTEE (พิกัด frontend-agent: PageDashboard.jsx ใต้ rangeSplit/netToday) — กันนับซ้ำ:
  // expense หมวด 'ค่าประกันมือหมอ' หักออกจาก expenseSum แล้วบวกเข้า regComm (net นับครั้งเดียวฝั่ง regComm)
  const guaranteeToday = (data.expenses || [])
    .filter((e) => e.category === GUARANTEE_CATEGORY && inDateRange(e.date, dr.from, dr.to))
    .reduce((s, e) => s + (e.amount || 0), 0);
  const expenseTodayRaw = (data.expenses || []).filter((e) => inDateRange(e.date, dr.from, dr.to)).reduce((s, e) => s + (e.amount || 0), 0);
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

  const month = buildMonthReport(data, stmtMonth);

  return (
    <div>
      <PageHeader icon={LayoutDashboard} title="ภาพรวม" eyebrow={tab === 'day' ? `สรุป ${fmtRange(dr.from, dr.to)}` : `สรุป${month.monthLabel}`} />

      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button onClick={() => setTab('day')} className={tab === 'day' ? 'on' : ''}>รายวัน</button>
        <button onClick={() => setTab('month')} className={tab === 'month' ? 'on' : ''}>รายเดือน</button>
      </div>

      {tab === 'day' && (
      <>
      <DateRange from={dr.from} to={dr.to} onChange={setDr} />
      {guaranteeMsg && singleDay && <div className="alert ok">{guaranteeMsg}</div>}

      <div className="hero-dark">
        <div className="hero-top"><span>สรุป {fmtRange(dr.from, dr.to)}</span><span>{rangeBills.length} บิล</span></div>
        <div className="hero-net">฿ {Math.round(netToday).toLocaleString()}</div>
        <div className="hero-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(dayTotal).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(expenseAllToday).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอ</span><div className="hv">฿ {Math.round(regCommAdj).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="หมอประจำ" />
        <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.regSales).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {Math.round(regCommAdj).toLocaleString()}</div></div>
        </div>
      </Card>
      <Card>
        <CardHead title="หมอวิ่ง" />
        <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.extSales).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {Math.round(rangeSplit.extComm + fuelToday).toLocaleString()}</div></div>
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
        <div className="hero-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(month.income).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(month.expenseAll).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอ</span><div className="hv">฿ {Math.round(month.regComm).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="ใบสรุปประจำเดือน" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary auto" style={{ flex: 1 }} onClick={() => window.print()}>PDF</button>
          <button className="btn btn-ghost auto" style={{ flex: 1 }} onClick={() => downloadMonthExcel(data, stmtMonth)}>Excel</button>
        </div>
      </Card>
      </>
      )}
      {createPortal(<div className="print-only"><MonthStatement data={data} month={stmtMonth} /></div>, document.body)}
    </div>
  );
}
