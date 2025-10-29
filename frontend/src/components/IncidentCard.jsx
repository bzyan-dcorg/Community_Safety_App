import { useEffect, useMemo, useState } from "react";
import { createFollowUp, updateIncident } from "../api.js";

const STATUS_STYLES = {
  unverified: "bg-slate-200 text-slate-700",
  "community-confirmed": "bg-amber-200 text-amber-800",
  "official-confirmed": "bg-emerald-200 text-emerald-800",
  resolved: "bg-emerald-300 text-emerald-900",
};

const TYPE_STYLES = {
  community: "bg-sky-100 text-sky-700",
  police: "bg-indigo-100 text-indigo-700",
  "public-order": "bg-rose-100 text-rose-700",
};

const CONTACT_OPTIONS = [
  { id: "unknown", label: "Not shared" },
  { id: "none", label: "No" },
  { id: "service-request", label: "Service request" },
  { id: "911", label: "911" },
  { id: "not-needed", label: "Not needed" },
];

const STATUS_OPTIONS = [
  { id: "unverified", label: "Unverified" },
  { id: "community-confirmed", label: "Community confirmed" },
  { id: "official-confirmed", label: "Official confirmed" },
  { id: "resolved", label: "Resolved" },
];

const SENTIMENT_OPTIONS = [
  { id: "safe", label: "Safe" },
  { id: "uneasy", label: "Uneasy" },
  { id: "unsafe", label: "Unsafe" },
  { id: "unsure", label: "Unsure" },
];

function formatTimestamp(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch (err) {
    return value;
  }
}

function PromptChip({ label, value }) {
  const formatted = value ? String(value).replace(/-/g, " ") : "Unknown";
  return (
    <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-slate-600 shadow-sm">
      {label}: <strong className="capitalize">{formatted}</strong>
    </span>
  );
}

function Segmented({ value, onChange, options, className = "" }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 py-1 text-[11px] transition ${
            value === option.id
              ? "bg-ink text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PromptToggle({ label, value, onChange }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {[
          { id: true, label: "Yes" },
          { id: false, label: "No" },
          { id: null, label: "Unsure" },
        ].map((option) => (
          <button
            key={String(option.id)}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1 text-[11px] transition ${
              value === option.id
                ? "bg-ink text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function IncidentCard({ incident, onMutated }) {
  const [showComposer, setShowComposer] = useState(false);
  const [notes, setNotes] = useState("");
  const [followStatus, setFollowStatus] = useState(incident.status || "unverified");
  const [followStillHappening, setFollowStillHappening] = useState(incident.still_happening);
  const [followFeelSafe, setFollowFeelSafe] = useState(incident.feel_safe_now);
  const [followContacted, setFollowContacted] = useState(incident.contacted_authorities || "unknown");
  const [followSentiment, setFollowSentiment] = useState(incident.safety_sentiment || "unsure");
  const [followAlias, setFollowAlias] = useState("Safety Ops");

  const [composeLoading, setComposeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const credibilityPercent = useMemo(() => {
    if (typeof incident.credibility_score !== "number") return 0;
    return Math.round(incident.credibility_score * 100);
  }, [incident.credibility_score]);

  const followUps = incident.follow_ups || [];
  const followUpDue = incident.follow_up_due_at ? new Date(incident.follow_up_due_at) : null;
  const followUpOverdue = followUpDue ? followUpDue.getTime() <= Date.now() : false;

  useEffect(() => {
    setFollowStatus(incident.status || "unverified");
  }, [incident.status]);

  useEffect(() => {
    setFollowStillHappening(incident.still_happening);
  }, [incident.still_happening]);

  useEffect(() => {
    setFollowFeelSafe(incident.feel_safe_now);
  }, [incident.feel_safe_now]);

  useEffect(() => {
    setFollowContacted(incident.contacted_authorities || "unknown");
  }, [incident.contacted_authorities]);

  useEffect(() => {
    setFollowSentiment(incident.safety_sentiment || "unsure");
  }, [incident.safety_sentiment]);

  async function handleMarkResolved() {
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      await updateIncident(incident.id, {
        status: "resolved",
        follow_up_due_at: null,
      });
      setSuccess("Marked as resolved.");
      if (onMutated) onMutated();
    } catch (err) {
      console.error(err);
      setError("Unable to update incident.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFollowUpSubmit(event) {
    event.preventDefault();
    setComposeLoading(true);
    setError("");
    setSuccess("");

    try {
      await createFollowUp(incident.id, {
        status: followStatus,
        notes: notes.trim() || undefined,
        still_happening: followStillHappening,
        feel_safe_now: followFeelSafe,
        contacted_authorities: followContacted,
        safety_sentiment: followSentiment,
        created_by: followAlias.trim() || undefined,
      });
      setNotes("");
      setShowComposer(false);
      setSuccess("Follow-up recorded.");
      if (onMutated) onMutated();
    } catch (err) {
      console.error(err);
      setError("Unable to submit follow-up.");
    } finally {
      setComposeLoading(false);
    }
  }

  return (
    <article className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur xs:p-5 md:p-6">
      <div className="flex flex-col gap-4 xs:gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              TYPE_STYLES[incident.incident_type] || "bg-slate-200 text-slate-700"
            }`}
            >
              {incident.incident_type?.replace("-", " ") || "Community"}
            </span>
            <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              STATUS_STYLES[incident.status] || STATUS_STYLES.unverified
            }`}
            >
              {incident.status?.replace("-", " ")}
            </span>
            {followUpOverdue && (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold text-rose-700">
                Follow-up due
              </span>
            )}
          </div>
          <h3 className="text-base font-semibold text-ink xs:text-lg">{incident.category}</h3>
          <p className="text-sm text-slate-600 whitespace-pre-line xs:text-base">{incident.description}</p>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 xs:gap-3">
            <span className="whitespace-nowrap">{formatTimestamp(incident.created_at)}</span>
            {incident.location_text && <span>📍 {incident.location_text}</span>}
            <span>Reporter: {incident.reporter_alias || "Community member"}</span>
          </div>
        </div>

        <div className="w-full md:w-56 md:max-w-xs">
          <div className="rounded-2xl bg-slate-100/70 px-3 py-3 text-[11px] text-slate-600 md:px-4 md:py-4">
            <div className="flex items-center justify-between">
              <span>Credibility</span>
              <span className="font-semibold text-ink">{credibilityPercent}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-slate-500 via-ink to-slate-900"
                style={{ width: `${Math.max(credibilityPercent, 5)}%` }}
              />
            </div>
            {followUpDue && (
              <p className="mt-3 text-[11px] text-slate-500">
                Next check-in: <span className="font-medium text-ink">{formatTimestamp(followUpDue)}</span>
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 text-[11px]">
            <button
              onClick={() => setShowComposer((prev) => !prev)}
              className="rounded-full border border-slate-200 px-3 py-2 font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
            >
              {showComposer ? "Cancel" : "Add follow-up"}
            </button>
            <button
              onClick={handleMarkResolved}
              disabled={actionLoading || incident.status === "resolved"}
              className="rounded-full bg-ink px-3 py-2 font-medium text-white shadow-soft transition hover:bg-[#121420] disabled:opacity-50"
            >
              {actionLoading ? "Updating…" : "Mark resolved"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <PromptChip label="Ongoing" value={incident.still_happening === true ? "yes" : incident.still_happening === false ? "no" : "unsure"} />
        <PromptChip label="Feels safe" value={incident.feel_safe_now === true ? "yes" : incident.feel_safe_now === false ? "no" : "unsure"} />
        <PromptChip label="Authorities" value={incident.contacted_authorities || "unknown"} />
        <PromptChip label="Sentiment" value={incident.safety_sentiment || "unsure"} />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">{error}</div>
      )}
      {success && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-600">{success}</div>
      )}

      {showComposer && (
        <form onSubmit={handleFollowUpSubmit} className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white/80 p-4 xs:p-5">
          <h4 className="text-sm font-semibold text-ink xs:text-base">Record a follow-up</h4>
          <Segmented value={followStatus} onChange={setFollowStatus} options={STATUS_OPTIONS} />
          <PromptToggle label="Is it still happening?" value={followStillHappening} onChange={setFollowStillHappening} />
          <PromptToggle label="Do people feel safe now?" value={followFeelSafe} onChange={setFollowFeelSafe} />
          <Segmented value={followContacted} onChange={setFollowContacted} options={CONTACT_OPTIONS} />
          <Segmented value={followSentiment} onChange={setFollowSentiment} options={SENTIMENT_OPTIONS} />
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-slate-500">Notes</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
              placeholder="Share what changed, who responded, or next steps…"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-slate-500">Update by</label>
            <input
              value={followAlias}
              onChange={(event) => setFollowAlias(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
              placeholder="Safety coordinator"
            />
          </div>
          <button
            type="submit"
            disabled={composeLoading}
            className="w-full rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-[#121420] disabled:opacity-50"
          >
            {composeLoading ? "Saving…" : "Save follow-up"}
          </button>
        </form>
      )}

      {followUps.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up timeline</h4>
          <ul className="mt-3 space-y-3">
            {followUps.map((entry) => (
              <li
                key={entry.id}
                className="rounded-2xl border border-white/70 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 shadow-inner"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{entry.created_by || "Community follow-up"}</span>
                  <span>{formatTimestamp(entry.created_at)}</span>
                </div>
                <p className="mt-1 text-xs font-semibold text-ink">
                  {entry.status?.replace("-", " ") || "Update"}
                </p>
                {entry.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{entry.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
