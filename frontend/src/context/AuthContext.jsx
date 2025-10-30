import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchProfile,
  loginEmail,
  loginWithProvider,
  registerEmail,
  setAuthToken,
} from "../api.js";

const AuthContext = createContext(null);

function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem("authToken");
}

function persistToken(token) {
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem("authToken", token);
  } else {
    window.localStorage.removeItem("authToken");
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession(currentToken) {
      if (!currentToken) {
        setAuthToken(null);
        setUser(null);
        setInitializing(false);
        persistToken(null);
        return;
      }

      setAuthToken(currentToken);
      persistToken(currentToken);
      setInitializing(true);

      try {
        const profile = await fetchProfile();
        if (!cancelled) {
          setUser(profile);
        }
      } catch (error) {
        console.error("Unable to refresh user session", error);
        if (!cancelled) {
          setUser(null);
          setToken(null);
          persistToken(null);
          setAuthToken(null);
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    hydrateSession(token);

    return () => {
      cancelled = true;
    };
  }, [token]);

  const persistSession = (session) => {
    setAuthToken(session.access_token);
    setToken(session.access_token);
    setUser(session.user);
    persistToken(session.access_token);
  };

  const handleRegister = async (payload) => {
    const session = await registerEmail(payload);
    persistSession(session);
    return session.user;
  };

  const handleLogin = async (payload) => {
    const session = await loginEmail(payload);
    persistSession(session);
    return session.user;
  };

  const handleProviderLogin = async (payload) => {
    const session = await loginWithProvider(payload);
    persistSession(session);
    return session.user;
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setAuthToken(null);
    persistToken(null);
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
      initializing,
      authenticated: Boolean(user),
      register: handleRegister,
      login: handleLogin,
      loginWithProvider: handleProviderLogin,
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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
