import { useState } from 'react';
import { Flower2, UserRound, KeyRound, ArrowLeft, TriangleAlert } from 'lucide-react';

export const OWNER_PASS = '123123';
const ROLE_KEY = 'ifeew_role';

export function saveRole(role) {
  try { sessionStorage.setItem(ROLE_KEY, role); } catch { /* ignore */ }
}

export function clearRole() {
  try {
    sessionStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem('ifeew_mgr_ok');
  } catch { /* ignore */ }
}

export default function RoleGate({ onSelect }) {
  const [mode, setMode] = useState('select'); // select | owner
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');

  const submitOwner = (e) => {
    e.preventDefault();
    if (pass === OWNER_PASS) {
      setErr('');
      onSelect('owner');
    } else {
      setErr('รหัสไม่ถูกต้อง ลองอีกครั้ง');
    }
  };

  return (
    <div className="gate-screen">
      <div className="gate-card">
        <div className="gate-mark"><Flower2 size={30} strokeWidth={1.5} /></div>
        <h1 className="gate-title">I'FEEW</h1>
        <p className="gate-sub">Thai Massage · เลือกบทบาทเพื่อเข้าใช้งาน</p>

        {mode === 'select' ? (
          <div className="gate-roles">
            <button className="gate-role" onClick={() => onSelect('staff')}>
              <span className="gate-ric"><UserRound size={22} /></span>
              <span><b>พนักงาน</b><small>เปิดบิล · ดูประวัติบิล · นับเงินสด</small></span>
            </button>
            <button className="gate-role" onClick={() => { setMode('owner'); setErr(''); setPass(''); }}>
              <span className="gate-ric"><KeyRound size={22} /></span>
              <span><b>เจ้าของร้าน</b><small>ภาพรวมกิจการ · จัดการทั้งหมด</small></span>
            </button>
          </div>
        ) : (
          <form onSubmit={submitOwner} style={{ marginTop: 18, textAlign: 'left' }}>
            <div className="field">
              <label>รหัสผ่านเจ้าของร้าน</label>
              <input
                type="password" autoFocus value={pass}
                onChange={(e) => { setPass(e.target.value); setErr(''); }}
                placeholder="กรอกรหัสผ่าน" className="input"
              />
            </div>
            {err && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
            <button type="submit" className="btn btn-primary btn-block" disabled={!pass}>
              <KeyRound size={17} /> เข้าสู่ระบบเจ้าของร้าน
            </button>
            <p className="muted" style={{ marginTop: 10, textAlign: 'center' }}>รหัสตัวอย่าง: 123123</p>
            <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setMode('select')}>
              <ArrowLeft size={16} /> กลับไปเลือกบทบาท
            </button>
          </form>
        )}

        <p className="gate-foot">Clean & Warm Spa · {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
