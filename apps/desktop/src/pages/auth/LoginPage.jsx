import { useState } from 'react';
import { PiArrowRight, PiEye, PiEyeClosed, PiLockKey, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import logoEmpresa from '../../public/LogoEmpresa.png';
import { Alert, Button, Input } from '../../ui';
import { useAuthStore } from '../../stores/authStore';

function BrandMark() {
  return (
    <img src={logoEmpresa} alt="QKarnes POS" className="h-16 w-auto object-contain" />
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
      <div className="absolute -left-16 top-8 h-72 w-72 rounded-full bg-primary/20 blur-2xl" />
      <div className="absolute right-[-80px] top-10 h-[420px] w-[420px] rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute bottom-[-120px] right-[9%] h-[460px] w-[320px] rounded-[50%] bg-info/20" />
      <div className="absolute bottom-[14%] right-[12%] h-[390px] w-[260px] rounded-[50%] border border-info/20 bg-info/10">
        {seeds.map((seed) => (
          <span
            key={seed.key}
            className="absolute rounded-full bg-info/25"
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
            className="absolute block h-56 w-28 rounded-[50%_50%_48%_52%/70%_70%_30%_30%] bg-primary/35"
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
    <div className="h-[100dvh] overflow-hidden bg-background p-3 sm:p-4">
      <div className="grid h-full min-h-0 overflow-hidden rounded-[32px] border border-border bg-surface shadow-[var(--shadow-lg)] lg:grid-cols-[minmax(0,0.98fr)_minmax(420px,0.92fr)]">
        <section className="flex min-h-0 items-center justify-center px-6 py-6 sm:px-10 sm:py-8 lg:px-14">
          <div className="flex h-full w-full max-w-[448px] flex-col justify-center">
            <div className="mb-8 flex items-center gap-4 sm:mb-10">
              <BrandMark />
            </div>

            <div>
              <h1 className="text-[clamp(1.95rem,4.2vw,2.7rem)] font-extrabold tracking-[-0.05em] text-text">
                Bienvenido de nuevo
              </h1>
              <p className="mt-3 max-w-md text-base leading-7 text-text-muted">
                Ingresa tus credenciales para acceder al sistema y continuar con la operación del POS.
              </p>
            </div>

            <form onSubmit={onSubmit} className="mt-8 space-y-4 sm:mt-10 sm:space-y-5">
              <label className="block space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-text-muted">Usuario</span>
                <div className="relative">
                  <PiUser className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-text-subtle" />
                  <Input
                    className="h-14 rounded-2xl border-border bg-surface-alt pl-12 pr-4 text-base shadow-none focus:border-primary focus:bg-surface focus:ring-primary-soft"
                    value={form.usuario}
                    onChange={(e) => setForm((s) => ({ ...s, usuario: e.target.value }))}
                    placeholder="Ingresa tu usuario"
                    autoComplete="username"
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="block text-xs font-bold uppercase tracking-wide text-text-muted">Contraseña</span>
                <div className="relative">
                  <PiLockKey className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-text-subtle" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    className="h-14 rounded-2xl border-border bg-surface-alt pl-12 pr-12 text-base shadow-none focus:border-primary focus:bg-surface focus:ring-primary-soft"
                    value={form.password}
                    onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))}
                    placeholder="Ingresa tu clave"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-4 top-1/2 inline-flex -translate-y-1/2 items-center justify-center text-text-subtle transition-colors hover:text-text-muted"
                  >
                    {showPassword ? <PiEyeClosed className="text-lg" /> : <PiEye className="text-lg" />}
                  </button>
                </div>
              </label>

              {error && <Alert tone="error">{error}</Alert>}

              <Button
                type="submit"
                className="h-14 w-full rounded-2xl !bg-primary !text-text-inverse text-base shadow-posMd hover:!bg-primary-hover"
                size="lg"
                disabled={loading}
              >
                <PiArrowRight className="mr-2 text-lg" />
                {loading ? 'Ingresando...' : 'Iniciar sesión'}
              </Button>

              <div className="pt-2 text-center text-sm text-text-subtle">
                Acceso local offline-first para ventas, caja, compras e inventario.
              </div>

              {showDemoHint && (
                <div className="space-y-3 rounded-[24px] border border-border bg-background p-4 shadow-sm">
                  <div className="text-center text-xs font-semibold uppercase tracking-[0.08em] text-text-muted">
                    Acceso rapido
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'admin', password: 'admin123' })}
                    >
                      Usar Admin
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'cajero', password: 'cajero123' })}
                    >
                      Usar Cajero
                    </Button>
                  </div>
                  <p className="text-center text-xs text-text-muted">
                    Solo disponible en entorno de desarrollo local.
                  </p>
                </div>
              )}
            </form>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_top,var(--color-primary)_0%,var(--color-primary-hover)_48%,color-mix(in_oklab,var(--color-primary-hover)_84%,black_16%)_100%)] lg:block">
          <MarketingArt />
          <div className="relative flex h-full items-end px-14 pb-16">
            <div className="max-w-xl text-text-inverse">
              <h2 className="text-5xl font-extrabold tracking-[-0.05em] text-text-inverse">
                Gestion eficiente para tu operacion
              </h2>
              <p className="mt-4 max-w-lg text-lg leading-8 text-text-inverse/90">
                Controla ventas, inventario, compras y transformaciones en un solo flujo. Opera con rapidez y toma mejores decisiones desde caja.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
