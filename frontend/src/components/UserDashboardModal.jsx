import { useEffect, useState } from "react";
import { fetchUserOverview } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (err) {
    return value;
  }
}

export default function UserDashboardModal({ open, onClose }) {
  const { authenticated } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !authenticated) return;
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, authenticated]);

  useEffect(() => {
    if (!authenticated && open && onClose) {
      onClose();
    }
  }, [authenticated, open, onClose]);

  async function loadOverview() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchUserOverview();
      setOverview(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load your dashboard right now.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-ink">Your neighborhood reputation</h3>
            <p className="text-sm text-slate-500">Track signals you&apos;ve shared and rewards you&apos;ve unlocked.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
              onClick={loadOverview}
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 transition hover:border-slate-400 hover:text-ink"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        {!error && (
          <div className="mt-4 space-y-6">
            {!overview && loading && <p className="text-sm text-slate-500">Loading your stats…</p>}

            {overview && (
              <>
                <section className="rounded-3xl border border-slate-100 bg-slate-50 px-5 py-4">
                  <div className="flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Membership tier</p>
                      <p className="text-lg font-semibold text-ink">
                        {overview.profile.membership_tier} · {overview.rewards.points} pts
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      {overview.rewards.points_to_next != null ? (
                        <span>
                          {overview.rewards.points_to_next} pts until{" "}
                          <strong>{overview.rewards.next_tier}</strong>
                        </span>
                      ) : (
                        <span>Top tier unlocked — thank you for leading the feed.</span>
                      )}
                      {overview.unread_notifications > 0 && (
                        <p className="mt-1 text-amber-600">
                          {overview.unread_notifications} verifier alerts waiting for you.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 text-center xs:grid-cols-2 md:grid-cols-4">
                    <StatCard label="Signals shared" value={overview.rewards.total_posts} />
                    <StatCard label="Confirmed useful" value={overview.rewards.confirmed_posts} />
                    <StatCard label="Total likes" value={overview.rewards.total_likes} />
                    <StatCard label="Reward points" value={overview.rewards.points} />
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-semibold text-ink">Recent posts</h4>
                    <span className="text-xs text-slate-500">
                      Showing {overview.recent_posts.length} of your latest updates
                    </span>
                  </div>
                  {overview.recent_posts.length === 0 ? (
                    <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      No reports yet — share what you&apos;re seeing to earn rewards.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {overview.recent_posts.map((post) => (
                        <article
                          key={post.id}
                          className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-ink">{post.category}</p>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{post.status}</p>
                            </div>
                            <div className="text-xs text-slate-500">{formatDate(post.created_at)}</div>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{post.description}</p>
                          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                            <span>
                              👍 {post.likes_count}
                            </span>
                            <span>
                              Rewarded {post.reward_points_awarded} pts
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 px-3 py-4 shadow-inner">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{label}</p>
    </div>
  );
}
