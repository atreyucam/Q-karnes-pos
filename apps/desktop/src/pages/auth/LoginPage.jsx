import { useState } from 'react';
import { PiArrowRight, PiEye, PiEyeClosed, PiLockKey, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from '../../ui';
import { useAuthStore } from '../../stores/authStore';

function BrandMark() {
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-[20px] border border-emerald-100 bg-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)]">
      <div className="absolute left-4 top-4 h-9 w-2 bg-[#0d6a45]" />
      <div className="absolute left-4 top-4 h-2 w-8 bg-[#0d6a45]" />
      <div className="absolute left-[26px] top-[26px] h-2 w-10 bg-[#0d6a45]" />
      <div className="absolute left-[26px] top-[20px] h-10 w-2 bg-[#0d6a45]" />
      <div className="absolute left-[37px] top-[20px] h-10 w-2 bg-[#f7b23c]" />
      <div className="absolute left-[34px] top-[23px] h-2 w-12 rotate-[-45deg] bg-[#f7b23c]" />
    </div>
  );
}

function MarketingArt() {
  const seeds = Array.from({ length: 36 }, (_, index) => ({
    key: index,
    size: 6 + ((index * 11) % 18),
    left: 8 + ((index * 19) % 76),
    top: 6 + ((index * 13) % 84)
  }));

  const leaves = [
    { key: 'a', transform: 'rotate(-22deg) translate(0, 0)', left: '0%', top: '0%' },
    { key: 'b', transform: 'rotate(-6deg) translate(52px, 16px)', left: '12%', top: '8%' },
    { key: 'c', transform: 'rotate(12deg) translate(118px, -4px)', left: '24%', top: '0%' },
    { key: 'd', transform: 'rotate(28deg) translate(204px, 22px)', left: '36%', top: '8%' },
    { key: 'e', transform: 'rotate(-18deg) translate(278px, 40px)', left: '48%', top: '0%' },
    { key: 'f', transform: 'rotate(18deg) translate(346px, 12px)', left: '60%', top: '8%' }
  ];

  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="absolute -left-16 top-8 h-72 w-72 rounded-full bg-emerald-900/20 blur-2xl" />
      <div className="absolute right-[-80px] top-10 h-[420px] w-[420px] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[9%] h-[460px] w-[320px] rounded-[50%] bg-cyan-950/20" />
      <div className="absolute bottom-[14%] right-[12%] h-[390px] w-[260px] rounded-[50%] border border-cyan-950/10 bg-cyan-900/10">
        {seeds.map((seed) => (
          <span
            key={seed.key}
            className="absolute rounded-full bg-cyan-950/25"
            style={{
              width: `${seed.size}px`,
              height: `${seed.size}px`,
              left: `${seed.left}%`,
              top: `${seed.top}%`
            }}
          />
        ))}
      </div>
      <div className="absolute left-[8%] top-[6%] h-[360px] w-[520px] opacity-20">
        {leaves.map((leaf) => (
          <span
            key={leaf.key}
            className="absolute block h-56 w-28 rounded-[50%_50%_48%_52%/70%_70%_30%_30%] bg-emerald-500/35"
            style={{
              transform: leaf.transform,
              left: leaf.left,
              top: leaf.top
            }}
          />
        ))}
      </div>
    </>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const showDemoHint = Boolean(import.meta.env?.DEV);

  const [form, setForm] = useState({ usuario: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="grid min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.16)] lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[minmax(0,0.98fr)_minmax(420px,0.92fr)]">
        <section className="flex min-h-full items-center justify-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="w-full max-w-[448px]">
            <div className="mb-10 flex items-center gap-4">
              <BrandMark />
            </div>

            <div>
              <h1 className="text-[clamp(2.2rem,5vw,3.1rem)] font-extrabold tracking-[-0.05em] text-slate-900">
                Bienvenido de nuevo
              </h1>
              <p className="mt-3 max-w-md text-base leading-7 text-slate-500">
                Ingresa tus credenciales para acceder al sistema y continuar con la operación del POS.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-10 space-y-5">
              <label className="block space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-700">Usuario</span>
                <div className="relative">
                  <PiUser className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
                  <Input
                    className="h-14 rounded-2xl border-slate-200 bg-slate-100 pl-12 pr-4 text-base shadow-none focus:border-emerald-500 focus:bg-white focus:ring-emerald-100"
                    value={form.usuario}
                    onChange={(e) => setForm((s) => ({ ...s, usuario: e.target.value }))}
                    placeholder="Ingresa tu usuario"
                    autoComplete="username"
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-700">Contraseña</span>
                <div className="relative">
                  <PiLockKey className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    className="h-14 rounded-2xl border-slate-200 bg-slate-100 pl-12 pr-12 text-base shadow-none focus:border-emerald-500 focus:bg-white focus:ring-emerald-100"
                    value={form.password}
                    onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                    placeholder="Ingresa tu clave"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-slate-400 transition-colors hover:text-slate-600"
                  >
                    {showPassword ? <PiEyeClosed className="text-lg" /> : <PiEye className="text-lg" />}
                  </button>
                </div>
              </label>

              {error && <Alert tone="error">{error}</Alert>}

              <Button
                type="submit"
                className="h-14 w-full rounded-2xl !bg-emerald-600 !text-white text-base shadow-[0_18px_40px_-24px_rgba(5,150,105,0.75)] hover:!bg-emerald-700"
                size="lg"
                disabled={loading}
              >
                <PiArrowRight className="mr-2 text-lg" />
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
              </Button>

              <div className="pt-2 text-center text-sm text-slate-400">
                Acceso local offline-first para ventas, caja, compras e inventario.
              </div>

              {showDemoHint && (
                <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Modo desarrollo
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'admin', password: 'admin123' })}
                    >
                      Usar Admin demo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'cajero', password: 'cajero123' })}
                    >
                      Usar Cajero demo
                    </Button>
                  </div>
                  <p className="text-center text-xs text-slate-500">
                    Solo disponible en entorno de desarrollo local.
                  </p>
                </div>
              )}
            </form>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_top,#0d6a45_0%,#074a39_45%,#063b34_100%)] lg:block">
          <MarketingArt />
          <div className="relative flex h-full items-end px-14 pb-16">
            <div className="max-w-xl text-white">
              <h2 className="text-5xl font-extrabold tracking-[-0.05em] text-white">
                Gestion eficiente para tu operacion
              </h2>
              <p className="mt-5 max-w-lg text-xl leading-9 text-emerald-50/90">
                Controla ventas, inventario, compras y transformaciones en un solo flujo. Opera con rapidez y toma mejores decisiones desde caja.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
