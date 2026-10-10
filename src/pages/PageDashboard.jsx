import { Crown, TrendingUp } from 'lucide-react';
import { Card, CardHead, EmptyState } from '../components/ui';

function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const billRows = (b) => b.items || b.customers || [];
const rowNet = (i) => i.net ?? i.price ?? 0;
const billTotal = (b) => Math.max(0, billRows(b).reduce((s, i) => s + rowNet(i), 0) - (b.discount || 0));

const PAY_LABELS = ['เงินสด', 'QR Code / โอนเงิน'];

export default function PageDashboard({ data }) {
  const today = localDay(0);
  const paidBills = (data.bills || []).filter((b) => b.status === 'paid');
  const totalSales = paidBills.reduce((s, b) => s + billTotal(b), 0);
  const totalExpenses = (data.expenses || []).reduce((s, e) => s + e.amount, 0);

  const todayBills = paidBills.filter((b) => (b.date || '').slice(0, 10) === today);
  const dayTotal = todayBills.reduce((s, b) => s + billTotal(b), 0);
  const expenseToday = (data.expenses || []).filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);

  const paySum = {};
  PAY_LABELS.forEach((m) => { paySum[m] = 0; });
  todayBills.forEach((b) => { if (paySum[b.paymentMethod] !== undefined) paySum[b.paymentMethod] += billTotal(b); });

  const svcAgg = {};
  paidBills.forEach((b) => {
    billRows(b).forEach((it) => {
      const key = it.category || it.serviceId || 'อื่นๆ';
      if (!svcAgg[key]) {
        svcAgg[key] = { qty: 0, revenue: 0, minutes: 0, name: it.category || it.serviceName || key };
      }
      svcAgg[key].qty += it.qty || 1;
      svcAgg[key].revenue += rowNet(it);
      svcAgg[key].minutes += (it.totalMinutes || (it.duration || 0) * (it.qty || 1) || 0);
    });
  });
  const topServices = Object.entries(svcAgg)
    .map(([id, v]) => ({ id, ...v, name: v.name || id }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const maxSvc = topServices[0]?.revenue || 1;

  const staffAgg = {};
  let freelanceTotal = 0;
  let freelanceMinutes = 0;
  const rowMinutes = (it) => (it.totalMinutes || (it.duration || 0) * (it.qty || 1) || 0);
  paidBills.forEach((b) => {
    billRows(b).forEach((it) => {
      if (String(it.therapistId || '').startsWith('EXT-')) { freelanceTotal += rowNet(it); freelanceMinutes += rowMinutes(it); return; }
      if (!staffAgg[it.therapistId]) staffAgg[it.therapistId] = { revenue: 0, minutes: 0 };
      staffAgg[it.therapistId].revenue += rowNet(it);
      staffAgg[it.therapistId].minutes += rowMinutes(it);
    });
  });
  const topStaff = Object.entries(staffAgg)
    .map(([id, v]) => ({ id, ...v, ...(data.therapists || []).find((t) => t.id === id) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const fmtMinutes = (m) => {
    m = Math.round(m || 0);
    if (m < 60) return `${m} นาที`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r === 0 ? `${h} ชม` : `${h} ชม ${r} นาที`;
  };

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">ยอดขายรวมทั้งหมด</div>
          <div className="kpi-value">฿{Math.round(totalSales).toLocaleString()}</div>
          <div className="kpi-sub">{paidBills.length} บิลที่ชำระแล้ว · วันนี้ ฿{dayTotal.toLocaleString()}</div>
        </div>
        <div className="kpi"><div className="kpi-label">กำไรเบื้องต้น</div><div className="kpi-value sm">฿{Math.round(totalSales - totalExpenses).toLocaleString()}</div><div className="kpi-sub">ขาย − จ่ายทั้งหมด</div></div>
        <div className="kpi"><div className="kpi-label">รายจ่ายรวม</div><div className="kpi-value sm">฿{totalExpenses.toLocaleString()}</div><div className="kpi-sub">{(data.expenses || []).length} รายการ · วันนี้ ฿{expenseToday.toLocaleString()}</div></div>
      </div>

      <Card>
        <CardHead title="ยอดขายวันนี้" hint={`${todayBills.length} บิล`} />
        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>฿{dayTotal.toLocaleString()}</div>
        <div style={{ marginTop: 10 }}>
          {PAY_LABELS.map((m) => {
            const v = paySum[m] || 0;
            const pct = dayTotal ? Math.max((v / dayTotal) * 100, v > 0 ? 3 : 0) : 0;
            return (
              <div key={m} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="muted">{m}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{v.toLocaleString()}</b>
                </div>
                <div className="bar-track" style={{ margin: '5px 0 0' }}><i className="bar-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="cols-2">
        <Card>
          <CardHead title="บริการขายดี" hint="ตามยอดเงิน · ทั้งหมด" right={<TrendingUp size={17} color="var(--faint)" />} />
          {topServices.map((s, i) => (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 15 }}>
                <b style={{ fontWeight: 700 }}>#{i + 1} {s.name}</b>
                <span className="muted">×{s.qty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: 12.5, marginTop: 3 }}>
                <span className="muted">เวลาทั้งหมด : {fmtMinutes(s.minutes)}</span>
                <b style={{ fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>฿{s.revenue.toLocaleString()}</b>
              </div>
              <div className="bar-track" style={{ margin: '7px 0 0' }}><i className="bar-fill" style={{ width: `${Math.max((s.revenue / maxSvc) * 100, 3)}%` }} /></div>
            </div>
          ))}
          {topServices.length === 0 && <EmptyState title="ยังไม่มีข้อมูลขาย" subtitle="เปิดบิลแรกจากหน้า POS" />}
        </Card>

        <div>
          <Card>
            <CardHead title="ท็อปพนักงาน" hint="ตามยอดขาย · ทั้งหมด" />            {topStaff.map((t, i) => (
              <div key={t.id} className="rank-row">
                <span className="thera-ava" style={{ width: 40, height: 40, fontSize: 18 }}>{(t.nickname || '?').charAt(0)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{i === 0 && <Crown size={12} style={{ color: 'var(--brown)', verticalAlign: -1 }} />} {t.name || t.id}</b>
                  <small className="muted" style={{ display: 'block' }}>{t.nickname || ''} · นวด {fmtMinutes(t.minutes)}</small>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{Math.round(t.revenue).toLocaleString()}</b>
              </div>
            ))}
            {topStaff.length === 0 && <EmptyState title="ยังไม่มีข้อมูล" subtitle="เปิดบิลแรกจากหน้า POS" />}
            {freelanceTotal > 0 && <p className="muted" style={{ marginTop: 8 }}>+ หมอวิ่ง (นอกระบบ) ฿{Math.round(freelanceTotal).toLocaleString()} · นวด {fmtMinutes(freelanceMinutes)}</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
