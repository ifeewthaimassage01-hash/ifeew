// การ์ดเช็กชื่อเข้างาน — ใช้ร่วมกันทั้ง POS (วันนี้) และค่าแรง (ย้อนหลัง, owner)
// props: { data, saveData, dateStr, role, title, hint }
// staff: แตะชื่อตัวเอง = เช็กชื่อ (ติ๊กแล้วปุ่มกดไม่ติด ถอนเองไม่ได้)
// owner: กดติ๊ก/ถอนให้ใครก็ได้ — ใช้สไตล์ thera/chip เดิม
import { Card, CardHead, fmtDay } from './ui';
import { bkkNow } from '../utils/bkk';
import { deleteExpenseFromCloud } from '../data/cloudSync';

/* อ่านเช็กชื่อของวันนั้น — ตรงกับ shape กลาง { dateStr: { therapistId: { at, by } } } */
const dayAttendanceOf = (data, dateStr) => ((data && data.attendance) || {})[dateStr] || {};

export default function AttendanceCard({ data, saveData, dateStr, role, title, hint }) {
  const isOwner = role === 'owner';
  const list = (data.therapists || []).filter((t) => t.active !== false);
  const dayAtt = dayAttendanceOf(data, dateStr);
  const checkedCount = list.filter((t) => dayAtt[t.id]).length;

  const writeEntry = (tid, entry) => {
    const nextDay = { ...dayAtt };
    if (entry) nextDay[tid] = entry;
    else delete nextDay[tid];
    const th = list.find((t) => t.id === tid);
    const stamp = bkkNow();
    const baseAudit = {
      id: `A-${Date.now()}`, timestamp: stamp,
      user: isOwner ? 'เจ้าของร้าน' : 'พนักงาน',
      action: entry ? 'เช็กชื่อเข้างาน' : 'ถอนเช็กชื่อ',
      detail: `${th?.name || tid} · ${dateStr}`,
      oldValue: '-', newValue: entry ? `เข้า ${String(entry.at).slice(11, 16)}` : 'ถอน',
      approvedBy: isOwner ? 'เจ้าของร้าน' : '-',
    };
    // P1-8 reversal — owner ถอนเช็กชื่อ: ลบ expense ประกันของคู่นั้น (notes key ตรงคู่)
    // ใน saveData ครั้งเดียวกับถอนชื่อ (กัน lost update) + ลบใน cloud เอง (upsert ลบให้ไม่ได้)
    // ถอนชื่อแล้ว ensure จะไม่สร้างกลับ (ไม่มีชื่อใน attendance แล้ว guaranteeTopups shortfall=0)
    // BUG-ATT-01: กัน expenses เป็น undefined ตอนเซฟทับ
    let nextExpenses = data.expenses || [];
    let reversalAudit = null;
    let doomedIds = [];
    if (!entry && isOwner) {
      const key = `guarantee:${tid}:${dateStr}`;
      const doomed = (data.expenses || []).filter((e) => e && e.notes === key);
      if (doomed.length > 0) {
        doomedIds = doomed.map((e) => e.id).filter((id) => id != null);
        const rm = new Set(doomedIds);
        nextExpenses = (data.expenses || []).filter((e) => !(e && rm.has(e.id)));
        const sum = doomed.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        reversalAudit = {
          id: `A-${Date.now()}-rv`, timestamp: stamp,
          user: 'เจ้าของร้าน',
          action: 'ถอนประกันมือ',
          detail: `${th?.name || tid} · ${dateStr}`,
          oldValue: `฿ ${sum}`,
          newValue: '฿ 0',
          approvedBy: 'เจ้าของร้าน',
        };
      }
    }
    saveData({
      ...data,
      attendance: { ...(data.attendance || {}), [dateStr]: nextDay },
      expenses: nextExpenses,
      auditLog: [...(data.auditLog || []), baseAudit, ...(reversalAudit ? [reversalAudit] : [])],
    });
    // ลบแถวใน cloud แบบ fire-and-forget ทีละ id (tolerant — พลาดรอบนี้ reconcile ลบให้รอบหน้า)
    doomedIds.forEach((id) => {
      try {
        const p = deleteExpenseFromCloud(id);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch { /* ignore */ }
    });
  };

  const onTap = (tid) => {
    if (dayAtt[tid]) {
      if (!isOwner) return; // staff ถอนเองไม่ได้ — ปุ่ม disabled อยู่แล้ว กันไว้ชั้นสอง
      writeEntry(tid, null);
    } else {
      writeEntry(tid, { at: bkkNow(), by: isOwner ? 'owner' : 'self' });
    }
  };

  return (
    <Card className="checkin-card">
      <CardHead
        title={title || 'เช็กชื่อวันนี้'}
        hint={hint}
        right={<span className="badge neutral">{checkedCount}/{list.length}</span>}
      />
      {list.length === 0 ? (
        <p className="muted">ยังไม่มีหมอประจำ — เพิ่มในหน้าจัดการร้าน</p>
      ) : (
        <div className="checkin-list">
          {list.map((th) => {
            const cur = dayAtt[th.id];
            const locked = !!cur && !isOwner; // staff ที่ติ๊กแล้ว: กดไม่ติด
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => onTap(th.id)}
                disabled={locked}
                className="checkin-row"
                aria-pressed={!!cur}
                aria-label={cur ? `${th.name} เช็กชื่อแล้ว${isOwner ? ' — แตะเพื่อถอน' : ''}` : `แตะเพื่อเช็กชื่อ ${th.name}`}
                title={cur ? (isOwner ? 'แตะเพื่อถอนเช็กชื่อ' : 'เช็กชื่อแล้ว (เฉพาะเจ้าของร้านถอนได้)') : (isOwner ? 'แตะเพื่อเช็กชื่อให้' : 'แตะเพื่อเช็กชื่อตัวเอง')}
              >
                <span className="thera-ava">{(th.name || '?').charAt(0)}</span>
                <span className="grow">
                  <b>{th.name}</b>
                  <small className="muted">{cur ? `เข้างาน ${String(cur.at || '').slice(11, 16)} น.` : 'ยังไม่เช็กชื่อ'}</small>
                </span>
                {cur
                  ? <span className="badge paid">✓ เข้าแล้ว</span>
                  : <span className="badge neutral">แตะเช็กชื่อ</span>}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
