import { Search, CalendarDays, ClipboardList } from 'lucide-react';
import { STATUS_OPTIONS } from './bookingUtils';

/* ══════════════════════════════════════════════════════════════════
   ตัวกรอง: วันที่ / สถานะ / ค้นหา / ทุกวันที่
   ══════════════════════════════════════════════════════════════════ */
export default function BookingFilters({
  date, allDates, statusFilter, query,
  onDateChange, onToggleAllDates, onStatusChange, onQueryChange,
}) {
  return (
    <section className="bk-adm-filters">
      <div className="bk-adm-filters-in">
        <div className="field bk-adm-field">
          <label htmlFor="adm-date"><CalendarDays size={12} strokeWidth={1.8} /> วันที่</label>
          <input
            id="adm-date" className="input" type="date" value={allDates ? '' : date}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={allDates}
          />
        </div>

        <div className="field bk-adm-field">
          <label htmlFor="adm-status"><ClipboardList size={12} strokeWidth={1.8} /> สถานะ</label>
          <select
            id="adm-status" className="input" value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="field bk-adm-field bk-adm-field-search">
          <label htmlFor="adm-search"><Search size={12} strokeWidth={1.8} /> ค้นหา</label>
          <div className="search-wrap">
            <Search size={15} strokeWidth={1.8} />
            <input
              id="adm-search" className="input" value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="รหัสจอง / ชื่อลูกค้า / เบอร์โทร" autoComplete="off" autoCapitalize="off"
            />
          </div>
        </div>

        <button
          type="button"
          className={`chip bk-adm-chip-all ${allDates ? 'on' : ''}`}
          onClick={onToggleAllDates}
          aria-pressed={allDates}
        >
          ทุกวันที่
        </button>
      </div>
    </section>
  );
}
