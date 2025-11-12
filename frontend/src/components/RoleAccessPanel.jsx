const ROLE_CARDS = [
  {
    id: "resident",
    title: "Resident",
    subtitle: "Neighborhood member",
    description: "Share what you see, follow live threads, and earn points for helpful confirmations.",
    highlight: "Open to everyone",
    accent: "from-emerald-50 to-white",
  },
  {
    id: "staff",
    title: "City / Agency Staff",
    subtitle: "Call center · housing · 311",
    description: "Coordinate requests from residents, trigger tickets, and keep service partners informed.",
    highlight: "Requires work email",
    accent: "from-sky-50 to-white",
  },
  {
    id: "reporter",
    title: "Journalist / Media",
    subtitle: "Local newsroom · press",
    description: "Verify trending incidents, request context from reporters, and follow resolution steps.",
    highlight: "Amplify verified posts",
    accent: "from-amber-50 to-white",
  },
  {
    id: "officer",
    title: "Officer / Public Safety",
    subtitle: "Police · transit · campus",
    description: "Focus on signals that need a sworn response and collaborate on field updates.",
    highlight: "Agency approval required",
    accent: "from-slate-50 to-white",
  },
];

export default function RoleAccessPanel({ onAuthRequest, authLoading }) {
  const handleClick = (mode, role) => {
    onAuthRequest?.(mode, role);
  };

  return (
    <section className="rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink sm:text-xl">Pick the entry point that matches your role</h2>
          <p className="text-sm text-slate-500 sm:text-base">
            Residents, staff, journalists, and officers can all register with tailored access and alerts.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Roles can be selected during registration or the first time you use social sign-in.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        {ROLE_CARDS.map((role) => (
          <article
            key={role.id}
            className={`flex flex-col rounded-2xl border border-slate-100 bg-gradient-to-b ${role.accent} p-4 text-sm text-slate-600 shadow-soft`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">{role.highlight}</p>
              <h3 className="mt-2 text-base font-semibold text-ink">{role.title}</h3>
              <p className="text-xs text-slate-500">{role.subtitle}</p>
            </div>
            <p className="mt-3 flex-1 text-sm text-slate-600">{role.description}</p>
            <div className="mt-4 flex flex-col gap-2 text-xs">
              <button
                type="button"
                className="rounded-full bg-ink px-3 py-1 text-white transition hover:bg-[#121420] disabled:opacity-50"
                onClick={() => handleClick("register", role.id)}
                disabled={authLoading}
              >
                Create new account
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
                onClick={() => handleClick("login", role.id)}
                disabled={authLoading}
              >
                I already have access
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
