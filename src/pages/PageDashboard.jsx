import { LayoutDashboard, ReceiptText, Wallet, Plus, ShieldCheck, Crown, TrendingUp } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, StatusBadge } from '../components/ui';

function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const billTotal = (b) => Math.max(0, (b.items || []).reduce((s, i) => s + (i.net || 0), 0) - (b.discount || 0));

const PAY_LABELS = ['เงินสด', 'QR Code / โอนเงิน'];

export default function PageDashboard({ data, onNavigate }) {
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
    (b.items || []).forEach((it) => {
      if (!svcAgg[it.serviceId]) svcAgg[it.serviceId] = { qty: 0, revenue: 0 };
      svcAgg[it.serviceId].qty += it.qty || 1;
      svcAgg[it.serviceId].revenue += it.net || 0;
    });
  });
  const topServices = Object.entries(svcAgg)
    .map(([id, v]) => ({ id, ...v, name: (data.services || []).find((s) => s.id === id)?.name || id }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const maxSvc = topServices[0]?.revenue || 1;

  const staffAgg = {};
  let freelanceTotal = 0;
  paidBills.forEach((b) => {
    (b.items || []).forEach((it) => {
      if (String(it.therapistId || '').startsWith('EXT-')) { freelanceTotal += it.net || 0; return; }
      if (!staffAgg[it.therapistId]) staffAgg[it.therapistId] = 0;
      staffAgg[it.therapistId] += it.net || 0;
    });
  });
  const topStaff = Object.entries(staffAgg)
    .map(([id, revenue]) => ({ id, revenue, ...(data.therapists || []).find((t) => t.id === id) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const recentBills = [...(data.bills || [])].reverse().slice(0, 5);
  const locked = !!data.eodStatus?.locked;

  const quick = [
    { label: 'เปิดบิลใหม่', icon: ReceiptText, go: 'pos' },
    { label: 'นับเงินสด', icon: Wallet, go: 'cash' },
    { label: 'บันทึกค่าใช้จ่าย', icon: Plus, go: 'expenses' },
    { label: 'ปิดวัน / Audit', icon: ShieldCheck, go: 'eod' },
  ];

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard} eyebrow="Owner Dashboard" title="ภาพรวมกิจการ"
        subtitle={`${new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })} · อัปเดตล่าสุดตอนเปิดหน้านี้`}
        actions={<span className={`badge ${locked ? 'void' : 'paid'}`}>{locked ? '🔒 ปิดวันแล้ว' : '● วันนี้ยังเปิดอยู่'}</span>}
      />

      <div className="kpi-grid">
        <div className="kpi dark span2">
          <div className="kpi-label">ยอดขายรวมทั้งหมด</div>
          <div className="kpi-value">฿{Math.round(totalSales).toLocaleString()}</div>
          <div className="kpi-sub">{paidBills.length} บิลที่ชำระแล้ว · วันนี้ ฿{dayTotal.toLocaleString()}</div>
        </div>
        <div className="kpi"><div className="kpi-label">กำไรเบื้องต้น</div><div className="kpi-value sm">฿{Math.round(totalSales - totalExpenses).toLocaleString()}</div><div className="kpi-sub">ขาย − จ่ายทั้งหมด</div></div>
        <div className="kpi"><div className="kpi-label">รายจ่ายรวม</div><div className="kpi-value sm">฿{totalExpenses.toLocaleString()}</div><div className="kpi-sub">{(data.expenses || []).length} รายการ · วันนี้ ฿{expenseToday.toLocaleString()}</div></div>
      </div>

      <div className="cols-2">
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

        <Card>
          <CardHead title="ทางลัด" hint="งานที่ใช้บ่อย" />
          <div className="quick-grid">
            {quick.map((q) => {
              const Icon = q.icon;
              return (
                <button key={q.go} className="quick-btn" onClick={() => onNavigate(q.go)}>
                  <Icon size={19} /><span>{q.label}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="cols-2">
        <Card>
          <CardHead title="บริการขายดี" hint="ตามยอดเงิน · ทั้งหมด" right={<TrendingUp size={17} color="var(--faint)" />} />
          {topServices.map((s, i) => (
            <div key={s.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <b style={{ fontWeight: 600 }}>#{i + 1} {s.name}</b>
                <span className="muted">×{s.qty} · <b style={{ color: 'var(--ink)' }}>฿{s.revenue.toLocaleString()}</b></span>
              </div>
              <div className="bar-track" style={{ margin: '6px 0 0' }}><i className="bar-fill" style={{ width: `${Math.max((s.revenue / maxSvc) * 100, 3)}%` }} /></div>
            </div>
          ))}
          {topServices.length === 0 && <EmptyState title="ยังไม่มีข้อมูลขาย" subtitle="เปิดบิลแรกจากหน้า POS" />}
        </Card>

        <div>
          <Card>
            <CardHead title="ท็อปพนักงาน" hint="ตามยอดขาย · ทั้งหมด" />
            {topStaff.map((t, i) => (
              <div key={t.id} className="rank-row">
                <span className="thera-ava" style={{ width: 40, height: 40, fontSize: 18 }}>{(t.nickname || '?').charAt(0)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{i === 0 && <Crown size={12} style={{ color: 'var(--brown)', verticalAlign: -1 }} />} {t.name || t.id}</b>
                  <small className="muted" style={{ display: 'block' }}>{t.nickname || ''}</small>
                </span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{Math.round(t.revenue).toLocaleString()}</b>
              </div>
            ))}
            {topStaff.length === 0 && <EmptyState title="ยังไม่มีข้อมูล" subtitle="เปิดบิลแรกจากหน้า POS" />}
            {freelanceTotal > 0 && <p className="muted" style={{ marginTop: 8 }}>+ หมอวิ่ง (นอกระบบ) ฿{Math.round(freelanceTotal).toLocaleString()}</p>}
          </Card>

          <Card>
            <CardHead title="บิลล่าสุด" hint="5 รายการ" right={<button className="btn btn-ghost" style={{ padding: '7px 13px', fontSize: 12 }} onClick={() => onNavigate('bills')}>ดูทั้งหมด</button>} />
            {recentBills.map((b) => (
              <button key={b.id} onClick={() => onNavigate('bills')} className="recent-bill">
                <span style={{ minWidth: 0 }}>
                  <span className="mono">{b.id}</span>
                  <small className="muted" style={{ display: 'block' }}>{b.customer || 'ลูกค้าทั่วไป'} · {(b.items || []).length} รายการ</small>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusBadge status={b.status} />
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{billTotal(b).toLocaleString()}</b>
                </span>
              </button>
            ))}
            {recentBills.length === 0 && <EmptyState title="ยังไม่มีบิล" subtitle="เปิดบิลแรกจากหน้า POS" />}
          </Card>
        </div>
      </div>
    </div>
  );
}
