import { useEffect, useMemo, useRef, useState } from "react";
import { fetchNotifications, markNotificationRead } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const VERIFIER_ROLES = new Set(["admin", "reporter", "officer"]);

function formatTimestamp(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}

export default function NotificationBell() {
  const { authenticated, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const isVerifier = useMemo(
    () => Boolean(authenticated && user?.role && VERIFIER_ROLES.has(user.role)),
    [authenticated, user],
  );

  useEffect(() => {
    if (!isVerifier) {
      setNotifications([]);
      setOpen(false);
      return;
    }
    loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerifier]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [open]);

  async function loadNotifications() {
    if (!isVerifier) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchNotifications();
      setNotifications(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load alerts.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id) {
    try {
      const updated = await markNotificationRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      console.error(err);
    }
  }

  if (!isVerifier) {
    return null;
  }

  const unreadCount = notifications.filter((item) => item.status === "unread").length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-soft transition hover:border-slate-400 hover:text-ink"
      >
        Alerts
        {unreadCount > 0 && (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xl">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink">
            <span>Verification requests</span>
            <button
              type="button"
              className="text-[11px] text-slate-500 transition hover:text-ink"
              onClick={loadNotifications}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          {error && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-rose-600">{error}</p>}

          {!error && notifications.length === 0 && !loading && (
            <p className="mt-3 text-[11px] text-slate-500">You&apos;re all caught up.</p>
          )}

          <div className="mt-3 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-2xl border px-3 py-2 ${
                  notification.status === "unread"
                    ? "border-amber-200 bg-amber-50"
                    : "border-slate-100 bg-slate-50"
                }`}
              >
                <p className="text-[11px] text-slate-600">{notification.message}</p>
                <p className="mt-1 text-[10px] text-slate-400">{formatTimestamp(notification.created_at)}</p>
                {notification.status === "unread" && (
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-semibold text-amber-700 transition hover:text-amber-900"
                    onClick={() => handleMarkRead(notification.id)}
                  >
                    Mark as read
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
