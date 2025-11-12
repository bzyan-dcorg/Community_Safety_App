export default function StatsOverview({ stats, error, onRefresh }) {
  const cards = [
    {
      label: "Signals Logged",
      value: stats?.total ?? "-",
      helper: "Rolling 7-day ingestion",
    },
    {
      label: "Follow-ups Due",
      value: stats?.active_follow_up ?? "-",
      helper: "Incidents awaiting confirmation",
    },
    {
      label: "Prompt Completion",
      value: stats ? `${Math.round((stats.prompt_completion_rate || 0) * 100)}%` : "–",
      helper: "Responses using structured prompts",
    },
    {
      label: "Avg. Credibility",
      value: stats ? Number(stats.avg_credibility ?? 0).toFixed(2) : "-",
      helper: "Community reputation heuristic",
    },
  ];

  return (
    <section className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-lg backdrop-blur-md">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink sm:text-lg">Signal Overview</h2>
          <p className="text-sm text-slate-500 sm:text-base">
            Blend of civic, police, and public order inputs with credibility scoring.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="w-full rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink sm:w-auto"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{card.value}</p>
            <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
          </article>
        ))}
      </div>

      {stats && (
        <div className="mt-6 grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
          <div>
            <span className="font-medium text-slate-600">By Status</span>
            <div className="mt-2 space-y-1">
              {Object.entries(stats.by_status || {}).map(([status, value]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="capitalize text-slate-500">{status.replace("-", " ")}</span>
                  <span className="font-medium text-slate-700">{value}</span>
                </div>
              ))}
              {(!stats.by_status || Object.keys(stats.by_status).length === 0) && (
                <p className="text-slate-400">No activity yet.</p>
              )}
            </div>
          </div>
          <div>
            <span className="font-medium text-slate-600">By Type</span>
            <div className="mt-2 space-y-1">
              {Object.entries(stats.by_type || {}).map(([type, value]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="capitalize text-slate-500">{type.replace("-", " ")}</span>
                  <span className="font-medium text-slate-700">{value}</span>
                </div>
              ))}
              {(!stats.by_type || Object.keys(stats.by_type).length === 0) && (
                <p className="text-slate-400">Awaiting first reports.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
