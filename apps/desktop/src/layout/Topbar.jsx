import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import { useAuthStore } from '../stores/authStore';

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('') || 'U';
}

export default function Topbar({ user, onToggleMenu }) {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  return (
    <header className="fixed left-0 right-0 top-0 z-20 h-16 border-b border-slate-200 bg-white shadow-sm lg:left-[var(--sidebar-width)]">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        <button
          type="button"
          onClick={onToggleMenu}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
        >
          <FiMenu className="text-xl" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#b41428] text-sm font-semibold text-white">
              {initials(user?.nombre)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-semibold text-slate-800">{user?.nombre || 'Usuario'}</p>
              <p className="text-xs text-slate-500">{user?.rol?.nombre || '-'}</p>
            </div>
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="rounded-xl px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold">{user?.nombre || 'Usuario'}</p>
              </div>
              <div className="my-1 border-t border-slate-100" />
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium text-[#b41428] hover:bg-rose-50"
              >
                Salir
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
