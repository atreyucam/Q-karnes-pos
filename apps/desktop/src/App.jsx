import { useEffect } from 'react';
import { useRoutes } from 'react-router-dom';
import { appRoutes } from './router/routes';
import { useAuthStore } from './stores/authStore';

function App() {
  const loadMe = useAuthStore((s) => s.loadMe);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (token) loadMe();
  }, [token, loadMe]);

  return useRoutes(appRoutes);
}

export default App;
