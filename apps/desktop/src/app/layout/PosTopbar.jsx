import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PiClock, PiList, PiSignOut, PiStorefront } from 'react-icons/pi';
import { Dropdown, IconButton, TopbarAction } from '../../shared/ui';
import { useAuthStore } from '../../stores/authStore';
import { useCajaStore } from '../../stores/cajaStore';

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase())
      .join('') || 'U'
  );
}

const ECUADOR_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;
const ECUADOR_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatNow(date) {
  const ecuadorDate = new Date(date.getTime() + ECUADOR_UTC_OFFSET_MS);
  const day = pad2(ecuadorDate.getUTCDate());
  const month = ECUADOR_MONTHS[ecuadorDate.getUTCMonth()] || '';
  const hour24 = ecuadorDate.getUTCHours();
  const hour = pad2(hour24);
  const minute = pad2(ecuadorDate.getUTCMinutes());
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  return `${day}-${month}, ${hour}:${minute} ${meridiem}`;
}

function formatNowDate(date) {
  return formatNow(date).split(',')[0];
}

function formatNowTime(date) {
  return formatNow(date).split(', ')[1] || '';
}

export default function PosTopbar({ user, onToggleMenu }) {
  const logout = useAuthStore((s) => s.logout);
  const turnoActual = useCajaStore((s) => s.turnoActual);
  const fetchTurnoActual = useCajaStore((s) => s.fetchTurnoActual);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const dropdownRef = useRef(null);

  useEffect(() => {
    function onClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncTurno = () => {
      fetchTurnoActual({ silent: true }).catch(() => {});
    };

    syncTurno();
    window.addEventListener('focus', syncTurno);
    const timer = window.setInterval(syncTurno, 60000);

    return () => {
      window.removeEventListener('focus', syncTurno);
      window.clearInterval(timer);
    };
  }, [fetchTurnoActual]);

  return (
    <header className="fixed left-0 right-0 top-0 z-[31] h-[var(--topbar-height)] border-b border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm lg:left-[var(--sidebar-width)]">
      <div className="flex h-full items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <IconButton
            type="button"
            variant="ghost"
            onClick={onToggleMenu}
            aria-label="Alternar menu lateral"
            className="text-[var(--color-text-muted)]"
          >
            <PiList className="text-xl" />
          </IconButton>
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:flex items-center gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[1.02rem] font-bold tracking-[-0.03em] text-[var(--color-text)] shadow-sm">
            <PiClock className="text-lg text-[var(--color-info)]" />
            <span>{formatNowDate(now)}</span>
          </div>
          <div className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[1.02rem] font-bold tracking-[-0.03em] text-[var(--color-text)] shadow-sm">
            {formatNowTime(now)}
          </div>
          <div className={`inline-flex items-center rounded-full border px-4 py-2.5 text-[1.02rem] font-bold tracking-[-0.03em] shadow-sm ${
            turnoActual?.id
              ? 'border-success bg-success text-text-inverse'
              : 'border-danger bg-danger text-text-inverse'
          }`}>
            {turnoActual?.id ? 'Caja abierta' : 'Caja cerrada'}
          </div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <TopbarAction onClick={() => setOpen((prev) => !prev)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-text-inverse)]">
              {initials(user?.nombre)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-[var(--color-text)]">{user?.nombre || 'Usuario'}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{user?.rol?.nombre || '-'}</p>
            </div>
          </TopbarAction>

          <Dropdown open={open}>
            <div className="rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-text)]">
              <p className="font-semibold">{user?.nombre || 'Usuario'}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{user?.rol?.nombre || '-'}</p>
            </div>
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button
              type="button"
              onClick={() => navigate('/caja')}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-alt)]"
            >
              <PiStorefront className="text-base text-[var(--color-info)]" />
              Ir a caja
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            >
              <PiSignOut className="text-base" />
              Salir
            </button>
          </Dropdown>
        </div>
      </div>
    </header>
  );
}
