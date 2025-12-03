import { useEffect, useState } from "react";
import { fetchUserOverview, fetchRewardPartners, redeemReward } from "../api.js";
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
  const [partners, setPartners] = useState([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState("");
  const [selectedPartner, setSelectedPartner] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [redeemNotes, setRedeemNotes] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState("");

  useEffect(() => {
    if (!open || !authenticated) return;
    loadOverview();
    loadPartners();
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

  async function loadPartners() {
    setPartnersLoading(true);
    setPartnersError("");
    try {
      const list = await fetchRewardPartners();
      setPartners(list);
    } catch (err) {
      console.error(err);
      setPartnersError("Unable to load partners. Please refresh.");
    } finally {
      setPartnersLoading(false);
    }
  }

  async function handleRedeem(event) {
    event?.preventDefault();
    if (!selectedPartner) {
      setRedeemError("Select a merchant partner.");
      return;
    }
    setRedeemError("");
    setRedeemSuccess("");
    setRedeeming(true);
    try {
      await redeemReward({
        partner_id: selectedPartner,
        quantity: Number(quantity) || 1,
        notes: redeemNotes.trim() || undefined,
      });
      setRedeemSuccess("Request received! A teammate will confirm via email shortly.");
      setSelectedPartner("");
      setQuantity(1);
      setRedeemNotes("");
      await loadOverview();
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || "Unable to redeem right now.";
      setRedeemError(typeof detail === "string" ? detail : "Unable to redeem right now.");
    } finally {
      setRedeeming(false);
    }
  }

  if (!open) {
    return null;
  }

  const handleOverlayDismiss = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onPointerDown={handleOverlayDismiss}
    >
      <div className="relative w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        <button
          type="button"
          aria-label="Close rewards dashboard"
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
          onClick={onClose}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
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

                <section className="rounded-3xl border border-white/70 bg-white/60 px-5 py-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-ink">Redeem manual rewards</h4>
                      <p className="text-xs text-slate-500">
                        Choose a partner and we&apos;ll email instructions once staff approve it.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
                      onClick={loadPartners}
                      disabled={partnersLoading}
                    >
                      {partnersLoading ? "Refreshing…" : "Refresh partners"}
                    </button>
                  </div>
                  {partnersError && <p className="mt-2 text-xs text-rose-600">{partnersError}</p>}
                  {!partnersLoading && partners.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">No partner perks yet — stay tuned.</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        {partners.map((partner) => (
                          <label
                            key={partner.id}
                            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm transition ${
                              selectedPartner === partner.id
                                ? "border-ink bg-slate-50"
                                : "border-slate-200 bg-white hover:border-ink"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-ink">{partner.name}</span>
                              <span className="text-xs text-slate-500">{partner.points_cost} pts</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{partner.description}</p>
                            <p className="mt-1 text-[11px] text-slate-400">{partner.fulfillment}</p>
                            <input
                              type="radio"
                              name="partner"
                              value={partner.id}
                              checked={selectedPartner === partner.id}
                              onChange={() => setSelectedPartner(partner.id)}
                              className="sr-only"
                            />
                          </label>
                        ))}
                      </div>

                      <form onSubmit={handleRedeem} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex flex-col text-xs font-semibold text-slate-600">
                            Quantity
                            <input
                              type="number"
                              min="1"
                              max="5"
                              value={quantity}
                              onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                              className="mt-1 w-24 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
                            />
                          </label>
                          <label className="flex-1 text-xs font-semibold text-slate-600">
                            Notes to staff (optional)
                            <textarea
                              value={redeemNotes}
                              onChange={(event) => setRedeemNotes(event.target.value)}
                              rows={2}
                              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
                              placeholder="Share pickup preference or context."
                            />
                          </label>
                        </div>
                        {redeemError && <p className="text-xs text-rose-600">{redeemError}</p>}
                        {redeemSuccess && <p className="text-xs text-emerald-600">{redeemSuccess}</p>}
                        <button
                          type="submit"
                          className="w-full rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#111522] disabled:opacity-60"
                          disabled={redeeming}
                        >
                          {redeeming ? "Submitting…" : "Submit redemption request"}
                        </button>
                      </form>
                    </div>
                  )}
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

                <section>
                  <h4 className="text-base font-semibold text-ink">Ledger history</h4>
                  {overview.ledger.length === 0 ? (
                    <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                      Rewards activity will appear here once you start reporting or redeeming.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {overview.ledger.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-ink">{entry.description}</span>
                            <span className="text-slate-400">{formatDate(entry.created_at)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span>Status: {entry.status}</span>
                            {entry.partner_name && <span>Partner: {entry.partner_name}</span>}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-sm">
                            <span className="text-slate-500">{entry.source}</span>
                            <span className={`font-semibold ${entry.delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {entry.delta >= 0 ? "+" : ""}
                              {entry.delta} pts
                            </span>
                          </div>
                        </div>
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
