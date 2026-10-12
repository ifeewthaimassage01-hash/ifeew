// Monthly statement (print-to-PDF) — rendered inside .print-only, visible in print only.
import { commBaht } from '../data/demoData';
import { formatDuration } from './ui';
import { bkkToday } from '../utils/bkk';

const rowsOf = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, rowsOf(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));

function thaiMonth(ym) {
  const d = new Date(`${ym}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
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

// Shared computation for the printed statement and the Excel/CSV export.
export function buildMonthReport(data, month) {
  const therapists = data.therapists || [];
  const services = data.services || [];
  const staffIds = new Set(therapists.map((t) => t.id));
  const nameOf = (tid, fallback) => {
    const t = therapists.find((x) => x.id === tid);
    return t ? t.name : (fallback || tid || '—');
  };
  const commOf = (it) => {
    const svc = services.find((x) => x.id === it.serviceId);
    return svc ? commBaht(svc) * (it.qty || 1) : 0;
  };
  const isStaff = (tid) => tid && staffIds.has(String(tid));

  const paidBills = (data.bills || []).filter((b) => b.status === 'paid' && String(b.date || '').slice(0, 7) === month);
  const expenses = (data.expenses || []).filter((e) => String(e.date || '').slice(0, 10).slice(0, 7) === month);

  const income = paidBills.reduce((s, b) => s + billTotal(b), 0);
  const expenseSum = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  // ชื่อบริการ: ใช้ชื่อที่เซฟในบิลก่อน ถ้าไม่มีค้นจากรหัสในรายการปัจจุบัน
  const serviceDisplay = (it) => {
    if (it.serviceName) return it.serviceName;
    const svc = services.find((x) => x.id === it.serviceId);
    if (svc) return `${svc.category}${svc.duration != null ? ` ${formatDuration(svc.duration)}` : ''}`;
    return it.serviceId || '—';
  };

  // line items sorted by datetime
  const lines = [];
  paidBills.forEach((b) => {
    rowsOf(b).forEach((it) => {
      const tid = it.therapistId || b.therapistId;
      const price = rowNet(it);
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
    paidBills, expenses, lines, dayRows, expByDay, paySum, therRows,
    income, expenseSum, regComm, extComm, fuelSum, expenseAll, net,
  };
}

export default function MonthStatement({ data, month }) {
  const {
    paidBills, expenses, lines, dayRows, expByDay, paySum, therRows,
    income, expenseSum, regComm, extComm, fuelSum, net,
  } = buildMonthReport(data, month);

  const thb = (n) => `฿ ${Math.round(n).toLocaleString()}`;

  return (
    <div className="stmt">
      <div className="stmt-head">
        <div className="stmt-brand">I'FEEW THAI MASSAGE</div>
        <h1>ใบสรุปประจำเดือน {thaiMonth(month)}</h1>
        <div className="stmt-sub">พิมพ์เมื่อ {fmtDay(bkkToday())} · บิลชำระแล้ว {paidBills.length} ใบ · {lines.length} รายการ</div>
      </div>

      <table className="stmt-tbl">
        <tbody>
          <tr><td>รายได้ทั้งหมด</td><td className="r"><b>{thb(income)}</b></td></tr>
          <tr><td>รายจ่าย</td><td className="r">{thb(expenseSum)}</td></tr>
          <tr><td>ค่าแรงหมอประจำ</td><td className="r">{thb(regComm)}</td></tr>
          <tr><td>ค่าแรงหมอวิ่ง</td><td className="r">{thb(extComm)}</td></tr>
          <tr><td>ค่าน้ำมันหมอวิ่ง</td><td className="r">{thb(fuelSum)}</td></tr>
          <tr className="stmt-net"><td><b>ยอดสุทธิ</b></td><td className="r"><b>{thb(net)}</b></td></tr>
        </tbody>
      </table>

      <h2>สรุปรายวัน</h2>
      <table className="stmt-tbl">
        <thead><tr><th>วันที่</th><th className="r">บิล</th><th className="r">รายได้</th><th className="r">รายจ่าย</th><th className="r">สุทธิ</th></tr></thead>
        <tbody>
          {dayRows.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              <td className="r">{d.bills.size}</td>
              <td className="r">{thb(d.income)}</td>
              <td className="r">{thb(expByDay[d.date] || 0)}</td>
              <td className="r">{thb(d.income - (expByDay[d.date] || 0) - d.comm)}</td>
            </tr>
          ))}
          {dayRows.length === 0 && <tr><td colSpan={5} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
      </table>

      <h2>รายการขายรายตัว</h2>
      <table className="stmt-tbl">
        <thead><tr><th>วันที่–เวลา</th><th>บริการ</th><th>หมอ</th><th className="r">ราคา</th><th className="r">ค่าแรง</th><th className="r">สุทธิ</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDay(l.date)} {fmtTime(l.ts)}</td>
              <td>{l.service}</td>
              <td>{l.therapist}</td>
              <td className="r">{thb(l.price)}</td>
              <td className="r">{thb(l.comm)}</td>
              <td className="r">{thb(l.net)}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={6} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
        {lines.length > 0 && (
          <tfoot><tr><td colSpan={3}><b>รวมทั้งเดือน</b></td><td className="r"><b>{thb(income)}</b></td><td className="r"><b>{thb(regComm + extComm)}</b></td><td className="r"><b>{thb(income - regComm - extComm)}</b></td></tr></tfoot>
        )}
      </table>

      <h2>ช่องทางชำระ</h2>
      <table className="stmt-tbl">
        <thead><tr><th>ช่องทาง</th><th className="r">บิล</th><th className="r">ยอด</th></tr></thead>
        <tbody>
          {Object.entries(paySum).map(([m, v]) => (
            <tr key={m}><td>{m}</td><td className="r">{v.n}</td><td className="r">{thb(v.total)}</td></tr>
          ))}
          {Object.keys(paySum).length === 0 && <tr><td colSpan={3} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
      </table>

      <h2>ค่าแรงรายหมอ</h2>
      <table className="stmt-tbl">
        <thead><tr><th>หมอ</th><th className="r">งาน</th><th className="r">ยอดขาย</th><th className="r">ค่าแรง</th></tr></thead>
        <tbody>
          {therRows.map((t) => (
            <tr key={t.name}><td>{t.name}</td><td className="r">{t.jobs}</td><td className="r">{thb(t.sales)}</td><td className="r">{thb(t.comm)}</td></tr>
          ))}
          {therRows.length === 0 && <tr><td colSpan={4} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
      </table>

      <h2>รายการรายจ่าย</h2>
      <table className="stmt-tbl">
        <thead><tr><th>วันที่</th><th>รายการ</th><th>วิธีจ่าย</th><th className="r">ยอด</th></tr></thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDay(String(e.date || '').slice(0, 10))}</td><td>{e.item}{e.notes && e.notes !== e.item ? ` · ${e.notes}` : ''}</td><td>{e.method || '—'}</td><td className="r">{thb(e.amount || 0)}</td></tr>
          ))}
          {expenses.length === 0 && <tr><td colSpan={4} className="c muted">— ไม่มีรายการ —</td></tr>}
        </tbody>
      </table>

      <div className="stmt-foot">
        <span>ผู้จัดทำ: ........................................</span>
        <span>วันที่พิมพ์: {fmtDay(bkkToday())}</span>
      </div>
    </div>
  );
}
