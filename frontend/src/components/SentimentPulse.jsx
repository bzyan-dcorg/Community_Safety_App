const SENTIMENT_COLORS = {
  safe: "bg-emerald-200 text-emerald-800",
  uneasy: "bg-amber-200 text-amber-800",
  unsafe: "bg-rose-200 text-rose-800",
  unsure: "bg-slate-200 text-slate-700",
};

export default function SentimentPulse({ stats, categories }) {
  const sentiments = stats?.sentiment_breakdown || {};
  const total = Object.values(sentiments).reduce((acc, value) => acc + value, 0);

  return (
    <section className="rounded-3xl border border-white/50 bg-white/70 p-6 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">Sentiment Pulse</h2>
          <p className="text-sm text-slate-500">
            Snapshot of how residents feel after reporting an issue.
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
          Awaiting sentiment responses. Encourage guided prompts in the form to unlock insights.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {Object.entries(sentiments).map(([sentiment, value]) => {
            const percent = total ? Math.round((value / total) * 100) : 0;
            return (
              <div key={sentiment}>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="capitalize">{sentiment}</span>
                  <span className="font-medium text-slate-700">{percent}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-slate-500 via-ink to-slate-800"
                    style={{ width: percent === 0 ? "0%" : `${Math.max(percent, 5)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Recent categories of note</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(categories || []).slice(0, 6).map((category) => (
            <span
              key={category}
              className="rounded-full bg-white/80 px-3 py-1 text-slate-600 shadow-sm"
            >
              {category}
            </span>
          ))}
          {(categories || []).length === 0 && (
            <span className="text-slate-400">Loading taxonomy…</span>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-[11px]">
        {Object.entries(sentiments).map(([sentiment, value]) => (
          <span
            key={sentiment}
            className={`rounded-full px-3 py-1 ${SENTIMENT_COLORS[sentiment] || "bg-slate-200 text-slate-700"}`}
          >
            {sentiment} · {value}
          </span>
        ))}
      </div>
    </section>
  );
}
