import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { decodeJwt } from "../utils/jwt.js";

const TABS = [
  { id: "login", label: "Sign in" },
  { id: "register", label: "Create account" },
];

const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = import.meta.env?.VITE_APPLE_CLIENT_ID;
const APPLE_REDIRECT_URI = import.meta.env?.VITE_APPLE_REDIRECT_URI;

const scriptCache = new Map();

function loadScript(id, src) {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("Scripts can only be loaded in the browser"));
  }

  if (scriptCache.has(id)) {
    return scriptCache.get(id);
  }

  const existing = document.getElementById(id);
  if (existing) {
    const resolved = Promise.resolve();
    scriptCache.set(id, resolved);
    return resolved;
  }

  const script = document.createElement("script");
  script.id = id;
  script.src = src;
  script.async = true;

  const promise = new Promise((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
  });

  scriptCache.set(id, promise);
  document.head.appendChild(script);
  return promise;
}

function extractDisplayName(claims) {
  if (!claims || typeof claims !== "object") {
    return undefined;
  }
  if (typeof claims.name === "string" && claims.name.trim()) {
    return claims.name.trim();
  }
  const given = typeof claims.given_name === "string" ? claims.given_name.trim() : "";
  const family = typeof claims.family_name === "string" ? claims.family_name.trim() : "";
  const combined = [given, family].filter(Boolean).join(" ").trim();
  return combined || undefined;
}

export default function AuthModal({ open, onClose, initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [appleInitialized, setAppleInitialized] = useState(false);
  const googleButtonRef = useRef(null);

  const { login, register, loginWithProvider } = useAuth();
  const providerSupportsGoogle = Boolean(GOOGLE_CLIENT_ID);
  const providerSupportsApple = Boolean(APPLE_CLIENT_ID && APPLE_REDIRECT_URI);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setError("");
      setLoading(false);
      setGoogleInitialized(false);
      setAppleInitialized(false);
    }
  }, [open]);

  const handleCredentialLogin = useCallback(
    async (provider, idToken, { email: emailHint, displayName: nameHint } = {}) => {
      if (!idToken) {
        setError(`Unable to continue with ${provider}. Missing identity token.`);
        setLoading(false);
        return;
      }

      const normalizedEmail = emailHint?.trim();
      if (!normalizedEmail) {
        setError(
          `${provider === "google" ? "Google" : "Apple"} did not provide an email address. Ensure the email scope is granted for the provider.`,
        );
        setLoading(false);
        return;
      }

      const resolvedName = nameHint?.trim() || normalizedEmail.split("@")[0];

      setLoading(true);
      setError("");

      try {
        await loginWithProvider({
          provider,
          email: normalizedEmail,
          display_name: resolvedName,
          id_token: idToken,
        });
        onClose?.();
      } catch (err) {
        const detail = err?.response?.data?.detail || `Unable to continue with ${provider}.`;
        setError(Array.isArray(detail) ? detail.join(", ") : detail);
      } finally {
        setLoading(false);
      }
    },
    [loginWithProvider, onClose],
  );

  const handleGoogleCredential = useCallback(
    async (response) => {
      const credential = response?.credential;
      if (!credential) {
        setError("Google sign-in did not return a credential.");
        return;
      }

      const claims = decodeJwt(credential) || {};
      const emailClaim = typeof claims.email === "string" ? claims.email : undefined;
      const displayNameClaim = extractDisplayName(claims);

      await handleCredentialLogin("google", credential, {
        email: emailClaim,
        displayName: displayNameClaim,
      });
    },
    [handleCredentialLogin],
  );

  useEffect(() => {
    if (!open || !providerSupportsGoogle) {
      return;
    }

    let cancelled = false;

    loadScript("google-identity-services", "https://accounts.google.com/gsi/client")
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => handleGoogleCredential(response),
          ux_mode: "popup",
        });

        if (googleButtonRef.current) {
          googleButtonRef.current.innerHTML = "";
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: "outline",
            size: "large",
            text: "continue_with",
            shape: "pill",
            width: "100%",
          });
        }

        setGoogleInitialized(true);
      })
      .catch((err) => {
        console.error("Google Identity Services failed to load", err);
        setGoogleInitialized(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, providerSupportsGoogle, handleGoogleCredential]);

  useEffect(() => {
    if (!open || !providerSupportsApple) {
      return;
    }

    let cancelled = false;

    loadScript(
      "apple-sign-in",
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
    )
      .then(() => {
        if (cancelled || !window.AppleID?.auth) {
          return;
        }

        window.AppleID.auth.init({
          clientId: APPLE_CLIENT_ID,
          scope: "email name",
          redirectURI: APPLE_REDIRECT_URI,
          usePopup: true,
        });
        setAppleInitialized(true);
      })
      .catch((err) => {
        console.error("Apple sign in failed to load", err);
        setAppleInitialized(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, providerSupportsApple]);

  const canSubmit = useMemo(() => {
    if (!email || !password) return false;
    if (mode === "register" && !displayName) return false;
    return true;
  }, [email, password, mode, displayName]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    const payload = {
      email: email.trim(),
      password: password.trim(),
    };

    try {
      if (mode === "login") {
        await login(payload);
      } else {
        await register({
          ...payload,
          display_name: displayName.trim(),
        });
      }
      onClose?.();
    } catch (err) {
      const detail = err?.response?.data?.detail || "Unable to complete request.";
      setError(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally {
      setLoading(false);
    }
  };

  const handleMockProviderLogin = useCallback(
    async (provider) => {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        setError(
          "Enter an email address above to simulate social sign-in, or configure provider credentials in your environment variables.",
        );
        return;
      }

      setLoading(true);
      setError("");
      try {
        await loginWithProvider({
          provider,
          email: normalizedEmail,
          display_name: displayName.trim() || normalizedEmail.split("@")[0],
          id_token: `${provider}:${normalizedEmail}`,
        });
        onClose?.();
      } catch (err) {
        const detail = err?.response?.data?.detail || "Unable to continue with provider.";
        setError(Array.isArray(detail) ? detail.join(", ") : detail);
      } finally {
        setLoading(false);
      }
    },
    [displayName, email, loginWithProvider, onClose],
  );

  const handleAppleLogin = useCallback(async () => {
    if (!providerSupportsApple || !window.AppleID?.auth?.signIn) {
      await handleMockProviderLogin("apple");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await window.AppleID.auth.signIn();
      const idToken = response?.authorization?.id_token;
      const claims = decodeJwt(idToken) || {};
      const emailClaim =
        (typeof claims.email === "string" && claims.email) ||
        (typeof response?.user?.email === "string" && response.user.email) ||
        undefined;
      const displayNameClaim =
        extractDisplayName(claims) ||
        extractDisplayName(response?.user?.name) ||
        (emailClaim ? emailClaim.split("@")[0] : undefined);

      await handleCredentialLogin("apple", idToken, {
        email: emailClaim,
        displayName: displayNameClaim,
      });
    } catch (err) {
      if (err?.error === "popup_closed_by_user" || err?.error === "user_cancelled_authorize") {
        setError("Apple sign-in was cancelled.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to continue with Apple.");
      }
      setLoading(false);
    }
  }, [
    handleCredentialLogin,
    handleMockProviderLogin,
    providerSupportsApple,
  ]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-ink">
            {mode === "login" ? "Welcome back" : "Join the neighborhood"}
          </h3>
          <button
            type="button"
            className="rounded-full px-3 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex gap-2 rounded-full bg-slate-100 p-1 text-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 rounded-full px-3 py-1 transition ${
                mode === tab.id ? "bg-white text-ink shadow" : "text-slate-500"
              }`}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">Email</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              placeholder="you@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">
              {mode === "login" ? "Password" : "Create password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>

          {mode === "register" && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500">Display name</label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                placeholder="Neighborhood handle"
                required
              />
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#121420] disabled:opacity-50"
          >
            {loading ? "Processing…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-6 space-y-2">
          {providerSupportsGoogle && googleInitialized ? (
            <div ref={googleButtonRef} className="flex w-full justify-center" />
          ) : (
            <button
              type="button"
              onClick={() => handleMockProviderLogin("google")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
              disabled={loading}
            >
              Continue with Google
            </button>
          )}
          <button
            type="button"
            onClick={providerSupportsApple ? handleAppleLogin : () => handleMockProviderLogin("apple")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
            disabled={loading || (providerSupportsApple && !appleInitialized)}
          >
            Continue with Apple
          </button>
        </div>
      </div>
    </div>
  );
}
