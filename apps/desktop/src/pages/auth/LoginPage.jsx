import { useState } from 'react';
import { PiStorefront } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from '../../ui';
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
    <div className="min-h-screen bg-white px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-[430px]">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[var(--color-text)] text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
              <PiStorefront className="text-[1.85rem]" />
            </div>
          </div>

          <div className="mt-8 text-center">
            <h1 className="text-[clamp(2rem,4vw,2.5rem)] font-extrabold tracking-[-0.04em] text-[var(--color-text)]">
              Bienvenido de nuevo
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              Ingresa tus credenciales para abrir la estación y continuar con la operación del POS.
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-10 space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">Usuario</span>
              <Input
                className="h-12 rounded-[18px] border-transparent px-4"
                value={form.usuario}
                onChange={(e) => setForm((s) => ({ ...s, usuario: e.target.value }))}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">Password</span>
              <Input
                type="password"
                className="h-12 rounded-[18px] border-transparent px-4"
                value={form.password}
                onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                placeholder="Ingresa tu clave"
                autoComplete="current-password"
              />
            </label>

            {error && <Alert tone="error">{error}</Alert>}

            <Button
              type="submit"
              className="h-12 w-full rounded-[18px] !bg-[#3b82f6] !text-white shadow-none hover:!bg-[#2563eb]"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>

            <div className="pt-1 text-center text-sm text-[var(--color-text-muted)]">
              Acceso local offline-first para ventas, caja, compras e inventario.
            </div>

            {showDemoHint && (
              <div className="space-y-3 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
                <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                  Modo desarrollo
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="w-full"
                    onClick={() => setForm({ usuario: 'admin', password: 'admin123' })}
                  >
                    Usar Admin demo
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="w-full"
                    onClick={() => setForm({ usuario: 'cajero', password: 'cajero123' })}
                  >
                    Usar Cajero demo
                  </Button>
                </div>
                <p className="text-center text-xs text-[var(--color-text-muted)]">
                  Solo disponible en entorno de desarrollo local.
                </p>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
