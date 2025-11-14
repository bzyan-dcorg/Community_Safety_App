import { useEffect, useMemo, useState } from "react";
import IncidentForm from "./components/IncidentForm.jsx";
import IncidentList from "./components/IncidentList.jsx";
import StatsOverview from "./components/StatsOverview.jsx";
import SentimentPulse from "./components/SentimentPulse.jsx";
import AuthModal from "./components/AuthModal.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import UserDashboardModal from "./components/UserDashboardModal.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import IncidentApprovals from "./components/IncidentApprovals.jsx";
import { fetchStats, fetchTaxonomy } from "./api.js";
import { useAuth } from "./context/AuthContext.jsx";

const TYPE_FILTERS = [
  { id: "all", label: "All Signals" },
  { id: "community", label: "Community" },
  { id: "police", label: "Police" },
  { id: "public-order", label: "Public Order" },
];

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "unverified", label: "Unverified" },
  { id: "community-confirmed", label: "Community Confirmed" },
  { id: "official-confirmed", label: "Official Confirmed" },
  { id: "resolved", label: "Resolved" },
];

export default function App() {
  const { authenticated, user, logout, initializing: authLoading } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState("login");
  const [authModalRole, setAuthModalRole] = useState("resident");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [taxonomy, setTaxonomy] = useState(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);
  const [taxonomyError, setTaxonomyError] = useState("");

  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshToken, setRefreshToken] = useState(0);

  const handleRequireAuth = (mode = "login", role = "resident") => {
    setAuthModalMode(mode);
    setAuthModalRole(role);
    setAuthModalOpen(true);
  };

  useEffect(() => {
    async function loadTaxonomy() {
      setTaxonomyLoading(true);
      setTaxonomyError("");
      try {
        const data = await fetchTaxonomy();
        setTaxonomy(data);
      } catch (err) {
        console.error(err);
        setTaxonomyError("Unable to load taxonomy");
      } finally {
        setTaxonomyLoading(false);
      }
    }
    loadTaxonomy();
  }, []);

  const refreshStats = async () => {
    setStatsError("");
    try {
      const data = await fetchStats();
      setStats(data);
    } catch (err) {
      console.error(err);
      setStatsError("Unable to load stats");
    }
  };

  useEffect(() => {
    refreshStats();
  }, [refreshToken]);

  const availableCategories = useMemo(() => {
    if (!taxonomy) {
      return [];
    }
    return [
      ...(taxonomy.police_related?.items || []),
      ...(taxonomy.community_civic?.items || []),
      ...(taxonomy.public_order?.items || []),
    ];
  }, [taxonomy]);

  const showAdminPanel = user?.role === "admin";
  const showApproverPanel = user && !["admin", "resident"].includes(user.role);

  return (
    <div className="min-h-screen bg-mist text-ink">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_#e6f0ff,_#f8f9fb_60%)]" />
        <header className="px-4 pt-6 pb-4 xs:px-6 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 xs:flex-row xs:items-start xs:justify-between sm:items-center sm:gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500 sm:text-xs">Community Safety</p>
              <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl lg:text-4xl">
                Community Intelligence &amp; Sentiment
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
                Blend police incidents and neighborhood insights to surface what residents feel, need, and celebrate.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 xs:w-auto">
              <button
                className="w-full rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white shadow-soft transition hover:bg-[#121420]"
                onClick={() => {
                  refreshStats();
                  setRefreshToken((val) => val + 1);
                }}
              >
                Refresh Signals
              </button>
              {authenticated ? (
                <div className="flex flex-col gap-2 rounded-2xl bg-white/70 p-2 text-[11px] text-slate-600 shadow-inner sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-ink">
                    <span className="text-sm font-semibold">
                      {user?.display_name || "Neighbor"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                      {user?.membership_tier || "Member"}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                      {(user?.reward_points ?? 0).toLocaleString()} pts
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <NotificationBell />
                    <button
                      type="button"
                      className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
                      onClick={() => setDashboardOpen(true)}
                    >
                      My rewards
                    </button>
                    <button
                      type="button"
                      className="rounded-full px-3 py-1 text-[11px] font-medium text-rose-500 transition hover:bg-rose-100/80"
                      onClick={() => {
                        setDashboardOpen(false);
                        logout();
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-ink"
                  onClick={() => handleRequireAuth("login")}
                  disabled={authLoading}
                >
                  {authLoading ? "Loading…" : "Sign in"}
                </button>
              )}
            </div>
          </div>
        </header>

        {showAdminPanel ? <AdminPanel /> : null}
        {showApproverPanel ? <IncidentApprovals /> : null}

        <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 pb-16 xs:px-6 sm:px-8 lg:px-10">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,_2fr)_minmax(0,_3fr)]">
            <div className="space-y-6">
              <StatsOverview
                stats={stats}
                error={statsError}
                onRefresh={refreshStats}
              />
              <SentimentPulse stats={stats} categories={availableCategories} />
            </div>

            <div className="space-y-6">
              <IncidentForm
                taxonomy={taxonomy}
                taxonomyLoading={taxonomyLoading}
                taxonomyError={taxonomyError}
                onCreated={() => {
                  setRefreshToken((value) => value + 1);
                  refreshStats();
                }}
                onRequireAuth={handleRequireAuth}
              />
            </div>
          </section>

          <section className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur-sm sm:p-6">
            <div className="flex flex-col gap-4 xs:gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink sm:text-xl">Live Neighborhood Threads</h2>
                <p className="text-sm text-slate-500 sm:text-base">
                  Structured prompts help dedupe, prioritize, and share transparent updates.
                </p>
              </div>
              <div className="w-full overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
                <div className="flex min-w-max flex-nowrap gap-2 text-xs sm:flex-wrap sm:min-w-0">
                  {TYPE_FILTERS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setTypeFilter(item.id)}
                      className={`rounded-full border px-3 py-1 transition ${
                        typeFilter === item.id
                          ? "border-ink bg-ink text-white"
                          : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 w-full overflow-x-auto pb-1 text-[11px] text-slate-600 sm:overflow-visible sm:pb-0">
              <div className="flex min-w-max flex-nowrap gap-2 sm:flex-wrap sm:min-w-0">
                {STATUS_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setStatusFilter(item.id)}
                    className={`rounded-full px-3 py-1 transition ${
                      statusFilter === item.id
                        ? "bg-ink text-white"
                        : "bg-slate-100 hover:bg-slate-200"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <IncidentList
              incidentType={typeFilter === "all" ? undefined : typeFilter}
              statusFilter={statusFilter === "all" ? undefined : statusFilter}
              refreshToken={refreshToken}
              onMutated={() => {
                setRefreshToken((val) => val + 1);
                refreshStats();
              }}
              onRequireAuth={handleRequireAuth}
            />
          </section>
        </main>
      </div>
      <UserDashboardModal open={dashboardOpen} onClose={() => setDashboardOpen(false)} />
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        initialRole={authModalRole}
        onClose={() => setAuthModalOpen(false)}
      />
    </div>
  );
}
