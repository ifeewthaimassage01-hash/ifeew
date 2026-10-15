import { useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutDashboard } from 'lucide-react';
import { Card, CardHead, PageHeader, DateRange, inDateRange, fmtRange } from '../components/ui';
import { commBaht, isFreelance } from '../lib/billing';
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

export default function PageDashboard({ data }) {
  // วันธุรกิจตัดยอดตี 3 — หลังเที่ยงคืนถึงตี 3 ยังนับเป็นวันก่อนหน้า
  const today = bizToday();
  const [tab, setTab] = useState('day');
  const [dr, setDr] = useState({ from: today, to: today });
  const [stmtMonth, setStmtMonth] = useState(() => today.slice(0, 7));
  const paidBills = (data.bills || []).filter((b) => b.status === 'paid');

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
  const rangeBills = paidBills.filter((b) => inDateRange(bizDateOf(b.date), dr.from, dr.to));
  const rangeSplit = calcSplit(rangeBills);
  const dayTotal = rangeBills.reduce((s, b) => s + billTotal(b), 0);
  const expenseToday = (data.expenses || []).filter((e) => inDateRange(e.date, dr.from, dr.to)).reduce((s, e) => s + e.amount, 0);
  const freelanceToday = rangeSplit.extComm;
  // ยอดสุทธิ = รายได้ − รายจ่ายทั้งหมด(รายจ่าย + หมอวิ่ง + ค่าน้ำมัน) − ค่าแรงหมอประจำ
  const fuelToday = rangeBills.reduce((s, b) => s + (b.fuel || 0), 0);
  const expenseAllToday = expenseToday + freelanceToday + fuelToday;
  const netToday = dayTotal - expenseAllToday - rangeSplit.regComm;
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
      <p className="muted" style={{ marginTop: 6 }}>วันธุรกิจตัดยอด 03:00 — บิลหลังเที่ยงคืนถึงตี 3 นับเป็นของวันก่อนหน้า</p>

      <div className="hero-dark">
        <div className="hero-top"><span>สรุป {fmtRange(dr.from, dr.to)}</span><span>{rangeBills.length} บิล</span></div>
        <div className="hero-net">฿ {Math.round(netToday).toLocaleString()}</div>
        <div className="hero-sub">ยอดสุทธิ = รายได้ − รายจ่ายรวม − ค่าแรงหมอประจำ</div>
        <div className="hero-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(dayTotal).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(expenseAllToday).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอประจำ</span><div className="hv">฿ {Math.round(rangeSplit.regComm).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="ช่องทางชำระ" hint={`${rangeBills.length} บิล`} />
        <div>
          {payLabels.length === 0 && <p className="muted">ยังไม่มีบิลชำระแล้วในช่วงนี้</p>}
          {payLabels.map((m) => {
            const v = paySum[m] || 0;
            const pct = dayTotal ? Math.max((v / dayTotal) * 100, v > 0 ? 3 : 0) : 0;
            return (
              <div key={m} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="muted">{m}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>฿ {v.toLocaleString()}</b>
                </div>
                <div className="bar-track" style={{ margin: '5px 0 0' }}><i className="bar-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="cols-2">
        <Card>
          <CardHead title="หมอประจำ" hint="ยอดขาย · ค่าแรง" />
          <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
            <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.regSales).toLocaleString()}</div></div>
            <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {Math.round(rangeSplit.regComm).toLocaleString()}</div></div>
          </div>
        </Card>
        <Card>
          <CardHead title="หมอวิ่ง" hint="ยอดขาย · ค่าแรง (รวมค่าน้ำมัน)" />
          <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
            <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(rangeSplit.extSales).toLocaleString()}</div></div>
            <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {Math.round(rangeSplit.extComm + fuelToday).toLocaleString()}</div></div>
          </div>
        </Card>
      </div>

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
        <div className="hero-sub">ยอดสุทธิ = รายได้ − รายจ่ายรวม − ค่าแรงหมอประจำ</div>
        <div className="hero-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div className="hero-box"><span className="hl">รายได้</span><div className="hv">฿ {Math.round(month.income).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">รายจ่ายรวม</span><div className="hv">฿ {Math.round(month.expenseAll).toLocaleString()}</div></div>
          <div className="hero-box"><span className="hl">ค่าแรงหมอประจำ</span><div className="hv">฿ {Math.round(month.regComm).toLocaleString()}</div></div>
        </div>
      </div>

      <Card>
        <CardHead title="ค่าแรงเดือนนี้" hint={`${month.therRows.length} หมอ`} />
        <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 0 }}>
          <div className="mini-box"><div className="l">หมอประจำ</div><div className="v">฿ {Math.round(month.regComm).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">หมอวิ่ง (รวมค่าน้ำมัน)</div><div className="v">฿ {Math.round(month.extComm + month.fuelSum).toLocaleString()}</div></div>
        </div>
      </Card>

      <Card>
        <CardHead title="ใบสรุปประจำเดือน" hint="ดาวน์โหลดไฟล์" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary auto" style={{ flex: 1 }} onClick={() => window.print()}>PDF</button>
          <button className="btn btn-ghost auto" style={{ flex: 1 }} onClick={() => downloadMonthExcel(data, stmtMonth)}>Excel</button>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>PDF: กดแล้วเลือกปลายทางเป็น “Save as PDF” · Excel: ได้ไฟล์ CSV เปิดด้วย Excel ได้เลย</p>
      </Card>
      </>
      )}
      {createPortal(<div className="print-only"><MonthStatement data={data} month={stmtMonth} /></div>, document.body)}
    </div>
  );
}
