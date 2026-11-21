// src/AuthContext.jsx — global authentication state
import { createContext, useContext, useEffect, useState } from 'react';
import { apiMe, apiLogout } from './api.js';

export const AuthContext = createContext({
  user: null,
  loading: true,
  signOut: () => {},
  refresh: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { user: u } = await apiMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const signOut = async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
