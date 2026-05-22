import { useEffect, useState } from 'react';
import { PiArrowRight, PiEye, PiEyeClosed, PiLockKey, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Input } from '../../ui';
import { useAuthStore } from '../../stores/authStore';
import useFormErrors from '../../shared/hooks/useFormErrors';

function BrandMark() {
  return (
    <div className="flex h-[96px] w-[96px] items-center justify-center rounded-2xl border border-border bg-surface-alt text-[24px] font-extrabold text-text">
      QK
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const fetchBootstrapStatus = useAuthStore((s) => s.fetchBootstrapStatus);
  const bootstrapAdmin = useAuthStore((s) => s.bootstrapAdmin);
  const bootstrapStatus = useAuthStore((s) => s.bootstrapStatus);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const showDemoHint = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_ALLOW_DEMO_SEED === 'true');

  const [form, setForm] = useState({ usuario: '', password: '' });
  const [bootstrapForm, setBootstrapForm] = useState({
    nombre: '',
    usuario: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const formErrors = useFormErrors();
  const bootstrapErrors = useFormErrors();

  useEffect(() => {
    fetchBootstrapStatus().catch(() => {});
  }, [fetchBootstrapStatus]);

  const onSubmit = async (e) => {
    e.preventDefault();

    const nextErrors = {};
    if (!form.usuario.trim()) nextErrors.usuario = 'Este campo es obligatorio.';
    if (!form.password.trim()) nextErrors.password = 'Este campo es obligatorio.';
    if (!formErrors.setErrors(nextErrors)) return;

    try {
      await login(form.usuario, form.password);
      navigate('/dashboard');
    } catch (_) {
      // no-op
    }
  };

  const onBootstrapSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!bootstrapForm.nombre.trim()) nextErrors.nombre = 'Este campo es obligatorio.';
    if (!bootstrapForm.usuario.trim()) nextErrors.usuario = 'Este campo es obligatorio.';
    if (!bootstrapForm.password.trim()) nextErrors.password = 'Este campo es obligatorio.';
    if (!bootstrapForm.confirmPassword.trim()) nextErrors.confirmPassword = 'Este campo es obligatorio.';
    if (!bootstrapErrors.setErrors(nextErrors)) return;

    try {
      await bootstrapAdmin(bootstrapForm);
      await fetchBootstrapStatus();
      setBootstrapForm({ nombre: '', usuario: '', password: '', confirmPassword: '' });
    } catch (_) {
      // no-op
    }
  };

  if (bootstrapStatus?.bootstrap_required) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1720px] items-center justify-center overflow-hidden px-6 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[360px]">
            <div className="flex justify-center"><BrandMark /></div>
            <div className="mt-8 text-left">
              <h1 className="text-[30px] font-extrabold leading-[0.95] tracking-[-0.05em] text-text">Configuración inicial</h1>
              <p className="mt-4 text-[15px] font-medium leading-7 text-text-muted">
                Crea el primer usuario ADMIN para habilitar el acceso al sistema.
              </p>
            </div>
            <form onSubmit={onBootstrapSubmit} className="mt-8 space-y-4">
              <Input placeholder="Nombre" value={bootstrapForm.nombre} onChange={(e) => setBootstrapForm((s) => ({ ...s, nombre: e.target.value }))} />
              <Input placeholder="Usuario" value={bootstrapForm.usuario} onChange={(e) => setBootstrapForm((s) => ({ ...s, usuario: e.target.value }))} />
              <Input type="password" placeholder="Contraseña" value={bootstrapForm.password} onChange={(e) => setBootstrapForm((s) => ({ ...s, password: e.target.value }))} />
              <Input type="password" placeholder="Confirmar contraseña" value={bootstrapForm.confirmPassword} onChange={(e) => setBootstrapForm((s) => ({ ...s, confirmPassword: e.target.value }))} />
              {error ? <Alert tone="error">{error}</Alert> : null}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Creando ADMIN...' : 'Crear ADMIN inicial'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1720px] items-center justify-center overflow-hidden px-6 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-[320px]">
          <div className="flex justify-center">
            <BrandMark />
          </div>

          <div className="mt-8 text-left">
            <h1 className="text-[34px] font-extrabold leading-[0.95] tracking-[-0.05em] text-text">
              Bienvenido de nuevo
            </h1>
            <p className="mt-4 text-[15px] font-medium leading-7 text-text-muted">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <label className="block space-y-2">
              <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">
                Usuario
              </span>

              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <PiUser className="text-[18px] text-text-subtle" />
                </span>
                <Input
                  error={Boolean(formErrors.errors.usuario)}
                  className="h-[50px] rounded-[14px] border border-border bg-surface-alt pl-12 pr-4 text-[15px] shadow-none focus:border-primary focus:bg-surface focus:ring-0"
                  value={form.usuario}
                  onChange={(e) => {
                    formErrors.clearFieldError('usuario');
                    setForm((s) => ({ ...s, usuario: e.target.value }));
                  }}
                  placeholder="Ingresa tu usuario"
                  autoComplete="username"
                />
              </div>

              {formErrors.errors.usuario ? (
                <p className="text-sm text-[var(--color-danger)]">{formErrors.errors.usuario}</p>
              ) : null}
            </label>

            <label className="block space-y-2">
              <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-text-muted">
                Contraseña
              </span>

              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <PiLockKey className="text-[18px] text-text-subtle" />
                </span>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  error={Boolean(formErrors.errors.password)}
                  className="h-[50px] rounded-[14px] border border-border bg-surface-alt pl-12 pr-12 text-[15px] shadow-none focus:border-primary focus:bg-surface focus:ring-0"
                  value={form.password}
                  onChange={(e) => {
                    formErrors.clearFieldError('password');
                    setForm((s) => ({ ...s, password: e.target.value }));
                  }}
                  placeholder="Ingresa tu clave"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-subtle hover:text-text-muted focus:outline-none"
                >
                  {showPassword ? <PiEyeClosed className="text-[18px]" /> : <PiEye className="text-[18px]" />}
                </button>
              </div>

              {formErrors.errors.password ? (
                <p className="text-sm text-[var(--color-danger)]">{formErrors.errors.password}</p>
              ) : null}
            </label>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              <PiArrowRight className="mr-2 text-[18px]" />
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </Button>

            {showDemoHint ? (
              <div className="pt-5">
                <div className="rounded-[18px] border border-border bg-transparent px-4 py-4">
                  <div className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                    Acceso rápido
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="neutral"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'admin', password: 'admin123' })}
                    >
                      Usar Admin
                    </Button>

                    <Button
                      type="button"
                      variant="neutral"
                      size="md"
                      className="w-full"
                      onClick={() => setForm({ usuario: 'cajero', password: 'cajero123' })}
                    >
                      Usar Cajero
                    </Button>
                  </div>

                  <p className="mt-3 text-center text-[12px] leading-5 text-text-muted">
                    Solo disponible en entorno de desarrollo local.
                  </p>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
