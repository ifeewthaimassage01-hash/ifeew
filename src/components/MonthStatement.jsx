// Monthly statement (print-to-PDF) — bank-statement style with running balance.
// Rendered inside .print-only, visible in print only.
import { commBaht, freelanceDisplayName } from '../lib/billing';
import { formatDuration } from './ui';
import { bkkToday } from '../utils/bkk';

const rowsOf = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, rowsOf(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));

// สูตรยอดสุทธิมาตรฐานทั้งแอป: net = income − expenseSum − extComm − fuelSum − regComm
// โดย income = ผลรวม billTotal (หลังหักส่วนลดท้ายบิลแล้ว)
// ส่วนลดท้ายบิลปันลงแต่ละ line ตามสัดส่วนราคา เพื่อให้ผลรวม lines = income
function thaiMonth(ym) {
  const d = new Date(`${ym}-01T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
}

export function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(ts) {
  if (!ts) return '';
  const m = String(ts).match(/[T ](\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '';
}

// วันที่แบบตัวเลขสำหรับตาราง statement: dd/mm/yy (พ.ศ. 2 หลัก) เช่น 12/10/69
export function fmtDNum(iso) {
  const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '';
  return `${m[3]}/${m[2]}/${String(Number(m[1]) + 543).slice(-2)}`;
}

// Shared computation for the printed statement and the Excel/CSV export.
export function buildMonthReport(data, month) {
  const therapists = data.therapists || [];
  const services = data.services || [];
  const staffIds = new Set(therapists.map((t) => t.id));
  const nameOf = (tid, fallback) => {
    const t = therapists.find((x) => x.id === tid);
    if (t) return t.name;
    return freelanceDisplayName(fallback || tid || '—');
  };
  const commOf = (it) => {
    const svc = services.find((x) => x.id === it.serviceId);
    return svc ? commBaht(svc) * (it.qty || 1) : 0;
  };
  const isStaff = (tid) => tid && staffIds.has(String(tid));

  // ชื่อบริการ: ใช้ชื่อที่เซฟในบิลก่อน ถ้าไม่มีค้นจากรหัสในรายการปัจจุบัน
  const serviceDisplay = (it) => {
    if (it.serviceName) return it.serviceName;
    const svc = services.find((x) => x.id === it.serviceId);
    if (svc) return `${svc.category}${svc.duration != null ? ` ${formatDuration(svc.duration)}` : ''}`;
    return it.serviceId || '—';
  };

  const paidBills = (data.bills || []).filter((b) => b.status === 'paid' && String(b.date || '').slice(0, 7) === month);
  const expenses = (data.expenses || []).filter((e) => String(e.date || '').slice(0, 10).slice(0, 7) === month);

  const income = paidBills.reduce((s, b) => s + billTotal(b), 0);
  const expenseSum = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // line items sorted by datetime — ราคาแต่ละ line หักส่วนลดท้ายบิลตามสัดส่วนแล้ว
  const lines = [];
  paidBills.forEach((b) => {
    const rows = rowsOf(b);
    const subtotal = rows.reduce((s, it) => s + rowNet(it), 0);
    const disc = Math.max(0, Math.min(subtotal, b.discount || 0));
    rows.forEach((it) => {
      const tid = it.therapistId || b.therapistId;
      const gross = rowNet(it);
      // ปันส่วนลดท้ายบิลลง line ตามสัดส่วนราคา (กันยอดรวม lines เกิน income จริง)
      const share = subtotal > 0 ? gross / subtotal : (rows.length > 0 ? 1 / rows.length : 0);
      const price = Math.max(0, gross - disc * share);
      const comm = commOf(it);
      lines.push({
        ts: b.date || '', date: String(b.date || '').slice(0, 10),
        service: serviceDisplay(it),
        therapist: it.therapistName || b.therapistName || nameOf(tid),
        price, comm, net: price - comm, staff: isStaff(tid),
      });
    });
  });
  lines.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const regComm = lines.filter((l) => l.staff).reduce((s, l) => s + l.comm, 0);
  const extComm = lines.filter((l) => !l.staff).reduce((s, l) => s + l.comm, 0);
  const fuelSum = paidBills.reduce((s, b) => s + (b.fuel || 0), 0);
  const expenseAll = expenseSum + extComm + fuelSum;
  const net = income - expenseAll - regComm;

  // daily
  const days = {};
  lines.forEach((l) => {
    const d = days[l.date] || (days[l.date] = { date: l.date, bills: new Set(), income: 0, comm: 0 });
    d.income += l.price; d.comm += l.comm;
  });
  paidBills.forEach((b) => {
    const d = String(b.date || '').slice(0, 10);
    if (days[d]) days[d].bills.add(b.id);
  });
  const expByDay = {};
  expenses.forEach((e) => {
    const d = String(e.date || '').slice(0, 10);
    expByDay[d] = (expByDay[d] || 0) + (e.amount || 0);
  });
  paidBills.forEach((b) => {
    if (b.fuel) {
      const d = String(b.date || '').slice(0, 10);
      expByDay[d] = (expByDay[d] || 0) + b.fuel;
    }
  });
  const dayRows = Object.values(days).sort((a, b) => (a.date < b.date ? -1 : 1));

  // ---- bank-style ledger: sales (+) / commissions+fuel+expenses (−) with running balance ----
  const ledger = [];
  lines.forEach((l) => {
    ledger.push({
      ts: `${l.date}T${fmtTime(l.ts) || '00:00'}`,
      label: l.service,
      therapist: l.therapist,
      inAmt: l.price, outAmt: l.comm,
    });
  });
  paidBills.forEach((b) => {
    if (b.fuel) ledger.push({
      ts: `${String(b.date || '').slice(0, 10)}T${fmtTime(b.date) || '23:59'}`,
      label: 'ค่าน้ำมันหมอวิ่ง',
      therapist: '',
      inAmt: 0, outAmt: b.fuel,
    });
  });
  expenses.forEach((e) => {
    ledger.push({
      ts: `${String(e.date || '').slice(0, 10)}T23:59`,
      label: `${e.item || ''}${e.notes && e.notes !== e.item ? ` · ${e.notes}` : ''}`,
      therapist: '',
      inAmt: 0, outAmt: e.amount || 0,
    });
  });
  ledger.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  let bal = 0;
  ledger.forEach((r) => { bal += (r.inAmt || 0) - (r.outAmt || 0); r.balance = bal; });

  // payment channels
  const paySum = {};
  paidBills.forEach((b) => {
    const m = b.paymentMethod || '—';
    paySum[m] = paySum[m] || { n: 0, total: 0 };
    paySum[m].n += 1; paySum[m].total += billTotal(b);
  });

  // per therapist
  const byTher = {};
  lines.forEach((l) => {
    const k = l.therapist;
    byTher[k] = byTher[k] || { name: k, jobs: 0, sales: 0, comm: 0 };
    byTher[k].jobs += 1; byTher[k].sales += l.price; byTher[k].comm += l.comm;
  });
  const therRows = Object.values(byTher).sort((a, b) => b.sales - a.sales);

  return {
    month, monthLabel: thaiMonth(month),
    paidBills, expenses, lines, dayRows, expByDay, paySum, therRows, ledger,
    income, expenseSum, regComm, extComm, fuelSum, expenseAll, net,
  };
}

export default function MonthStatement({ data, month }) {
  const {
    paidBills, ledger, monthLabel,
    income, expenseSum, regComm, extComm, fuelSum, net,
  } = buildMonthReport(data, month);

  const thb = (n) => `฿ ${Math.round(n).toLocaleString()}`;
  const num2 = (n) => Math.round(n).toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="stmt">
      <div className="stmt-bank-head">
        <div className="stmt-brand">I'FEEW THAI MASSAGE</div>
        <div className="stmt-doc-title">ใบสรุปประจำเดือน {monthLabel}</div>
        <div className="stmt-doc-sub">พิมพ์เมื่อ {fmtDay(bkkToday())} · บิลชำระแล้ว {paidBills.length} ใบ · {ledger.length} รายการ</div>
      </div>

      <h2>รายการเดินบัญชี</h2>
      <table className="stmt-tbl">
        <thead><tr><th>วันที่</th><th>เวลา</th><th>รายการ</th><th>หมอนวด</th><th className="r">รายรับ</th><th className="r">รายจ่าย</th><th className="r">ยอดสะสม</th></tr></thead>
        <tbody>
          {ledger.map((r, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDNum(r.ts.slice(0, 10))}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(r.ts)}</td>
              <td>{r.label}</td>
              <td>{r.therapist}</td>
              <td className="r">{r.inAmt ? num2(r.inAmt) : ''}</td>
              <td className="r">{r.outAmt ? num2(r.outAmt) : ''}</td>
              <td className="r">{num2(r.balance)}</td>
            </tr>
          ))}
          {ledger.length === 0 && <tr><td colSpan={7} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
      </table>

      <h2>สรุปยอด</h2>
      <div className="stmt-meta stmt-meta-bottom">
        <span>รายได้ <b>{thb(income)}</b></span>
        <span>รายจ่าย <b>{thb(expenseSum)}</b></span>
        <span>ค่าแรงหมอประจำ <b>{thb(regComm)}</b></span>
        <span>ค่าแรงหมอวิ่ง (รวมค่าน้ำมัน) <b>{thb(extComm + fuelSum)}</b></span>
        <span className="stmt-meta-net">ยอดสุทธิ <b>{thb(net)}</b></span>
      </div>

      <div className="stmt-foot">
        <span>ผู้จัดทำ: ........................................</span>
        <span>วันที่พิมพ์: {fmtDay(bkkToday())}</span>
      </div>
    </div>
  );
}
