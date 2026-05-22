import { Suspense, useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { appRoutes } from './router/routes';
import { useAuthStore } from './stores/authStore';

function App() {
  const loadMe = useAuthStore((s) => s.loadMe);
  const token = useAuthStore((s) => s.token);
  const routes = useRoutes(appRoutes);

  useEffect(() => {
    if (token) loadMe();
  }, [token, loadMe]);

  return (
    <Suspense fallback={<div className="p-3 text-sm text-slate-500">Cargando módulo...</div>}>
      {routes}
    </Suspense>
  );
}

export default App;
