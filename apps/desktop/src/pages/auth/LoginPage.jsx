import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const showDemoHint = Boolean(import.meta.env?.DEV);

  const [form, setForm] = useState({ usuario: '', password: '' });

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(form.usuario, form.password);
      navigate('/dashboard');
    } catch (_) {
      // no-op
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-xl shadow-md w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold">QKarnes POS Desktop</h1>
        <p className="text-sm text-slate-600">Inicia sesion para continuar</p>

        <label className="block text-sm">
          Usuario
          <input
            className="mt-1 w-full border rounded px-3 py-2"
            value={form.usuario}
            onChange={(e) => setForm((s) => ({ ...s, usuario: e.target.value }))}
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full border rounded px-3 py-2"
            value={form.password}
            onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" className="w-full bg-slate-900 text-white py-2 rounded" disabled={loading}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        {showDemoHint && (
          <div className="space-y-2">
            <div className="text-xs text-slate-500">Modo desarrollo: usuarios demo disponibles.</div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                onClick={() => setForm({ usuario: 'admin', password: 'admin123' })}
              >
                Usar ADMIN demo
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                onClick={() => setForm({ usuario: 'cajero', password: 'cajero123' })}
              >
                Usar CAJERO demo
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
