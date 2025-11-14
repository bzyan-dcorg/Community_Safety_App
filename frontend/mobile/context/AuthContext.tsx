import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

import { UserProfile, fetchProfile, loginEmail, registerEmail, setAuthToken } from '@/utils/api';

const TOKEN_KEY = 'community_safety_auth_token';

type LoginPayload = Parameters<typeof loginEmail>[0];
type RegisterPayload = Parameters<typeof registerEmail>[0];

type AuthContextValue = {
  user: UserProfile | null;
  token: string | null;
  authenticated: boolean;
  initializing: boolean;
  login: (payload: LoginPayload) => Promise<UserProfile>;
  register: (payload: RegisterPayload) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistToken(value: string | null) {
  if (value) {
    await SecureStore.setItemAsync(TOKEN_KEY, value);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const persistSession = useCallback(
    (session: Awaited<ReturnType<typeof loginEmail>>) => {
      setToken(session.access_token);
      setAuthToken(session.access_token);
      setUser(session.user);
      void persistToken(session.access_token);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        if (!mounted || !storedToken) {
          return;
        }
        setToken(storedToken);
        setAuthToken(storedToken);
        try {
          const profile = await fetchProfile();
          if (mounted) {
            setUser(profile);
          }
        } catch (error) {
          console.warn('Unable to refresh user session', error);
          if (mounted) {
            setToken(null);
            setAuthToken(null);
            setUser(null);
          }
          await SecureStore.deleteItemAsync(TOKEN_KEY);
        }
      } finally {
        if (mounted) {
          setInitializing(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleRegister = async (payload: RegisterPayload) => {
    const session = await registerEmail(payload);
    persistSession(session, (value) => setToken(value), setUser);
    return session.user;
  };

  const handleLogin = async (payload: LoginPayload) => {
    const session = await loginEmail(payload);
    persistSession(session, (value) => setToken(value), setUser);
    return session.user;
  };

  const handleLogout = async () => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    await persistToken(null);
  };

  const refreshProfile = async () => {
    if (!token) {
      setUser(null);
      return null;
    }
    const profile = await fetchProfile();
    setUser(profile);
    return profile;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      authenticated: Boolean(token),
      initializing,
      login: handleLogin,
      register: handleRegister,
      logout: handleLogout,
      refreshProfile,
    }),
    [user, token, initializing],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
