import { Card, CardHead } from '../components/ui';

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

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi kpi-income">
          <div className="kpi-label">รายได้</div>
          <div className="kpi-value">฿ {Math.round(totalSales).toLocaleString()}</div>
        </div>
        <div className="kpi kpi-expense">
          <div className="kpi-label">รายจ่าย</div>
          <div className="kpi-value">฿ {Math.round(totalExpenses).toLocaleString()}</div>
        </div>
        <div className="kpi dark span2">
          <div className="kpi-label">ยอดสุทธิ </div>
          <div className="kpi-value">฿ {Math.round(totalSales - totalExpenses).toLocaleString()}</div>
        </div>
      </div>

      <Card>
        <CardHead title="สรุปวันนี้" hint={`${todayBills.length} บิล`} />
        <div className="mini3" style={{ marginBottom: 12 }}>
          <div className="mini-box"><div className="l">รายได้</div><div className="v">฿ {Math.round(dayTotal).toLocaleString()}</div></div>
          <div className="mini-box"><div className="l">รายจ่าย</div><div className="v">฿ {Math.round(expenseToday).toLocaleString()}</div></div>
          <div className="mini-box hl"><div className="l">สุทธิ</div><div className="v">฿ {Math.round(dayTotal - expenseToday).toLocaleString()}</div></div>
        </div>
        {/* <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>฿ {dayTotal.toLocaleString()}</div> */}
        <div style={{ marginTop: 10 }}>
          {PAY_LABELS.map((m) => {
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
    </div>
  );
}
