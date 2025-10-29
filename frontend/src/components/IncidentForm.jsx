import { useMemo, useState } from "react";
import { createIncident } from "../api.js";

const DEFAULT_TAXONOMY = {
  community_civic: {
    label: "Community & Civic",
    items: [
      "Package Theft",
      "Noise / Neighborhood Dispute",
      "Lost / Found Pet",
      "Streetlight Outage",
      "Sanitation / Illegal Dumping",
    ],
  },
  police_related: {
    label: "Police-Related",
    items: ["Burglary", "Robbery", "Suspicious Vehicle"],
  },
  public_order: {
    label: "Public Order",
    items: ["Street Racing", "Fireworks"],
  },
};

const INCIDENT_TYPES = [
  { id: "community", label: "Community / Civic" },
  { id: "public-order", label: "Public Order" },
  { id: "police", label: "Police" },
];

const CONTACTED_OPTIONS = [
  { id: "unknown", label: "Not shared" },
  { id: "none", label: "No" },
  { id: "service-request", label: "Service request" },
  { id: "911", label: "911" },
  { id: "not-needed", label: "Not needed" },
];

const SENTIMENT_OPTIONS = [
  { id: "safe", label: "Safe" },
  { id: "uneasy", label: "Uneasy" },
  { id: "unsafe", label: "Unsafe" },
  { id: "unsure", label: "Unsure" },
];

function SegmentedControl({ label, value, onChange, options, allowUnset = true }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id === value && allowUnset ? null : option.id)}
            className={`rounded-full px-3 py-1 text-xs transition ${
              option.id === value ? "bg-ink text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PromptControl({ label, value, onChange }) {
  const options = [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
    { id: "unsure", label: "Unsure" },
  ];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs transition ${
              value === option.id
                ? "bg-ink text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            onClick={() => onChange(value === option.id ? "unset" : option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function normalizePrompt(choice) {
  if (choice === "yes") return true;
  if (choice === "no") return false;
  return null;
}

export default function IncidentForm({ taxonomy, taxonomyLoading, taxonomyError, onCreated }) {
  const [category, setCategory] = useState("Package Theft");
  const [incidentType, setIncidentType] = useState("community");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [stillHappeningChoice, setStillHappeningChoice] = useState("unset");
  const [policeSeenChoice, setPoliceSeenChoice] = useState("unset");
  const [feelSafeChoice, setFeelSafeChoice] = useState("unset");
  const [contactedAuthorities, setContactedAuthorities] = useState("unknown");
  const [safetySentiment, setSafetySentiment] = useState(null);
  const [alias, setAlias] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const taxonomyData = taxonomy || DEFAULT_TAXONOMY;

  const categories = useMemo(() => {
    return [
      ...(taxonomyData?.community_civic?.items || []),
      ...(taxonomyData?.public_order?.items || []),
      ...(taxonomyData?.police_related?.items || []),
    ];
  }, [taxonomyData]);

  const structuredResponses = [stillHappeningChoice, policeSeenChoice, feelSafeChoice].filter(
    (value) => value !== "unset"
  ).length;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErr("");
    setSuccess(false);

    try {
      const payload = {
        category,
        incident_type: incidentType,
        description,
        location_text: locationText,
        still_happening: normalizePrompt(stillHappeningChoice),
        police_seen: normalizePrompt(policeSeenChoice),
        feel_safe_now: normalizePrompt(feelSafeChoice),
        contacted_authorities: contactedAuthorities,
        safety_sentiment: safetySentiment,
        reporter_alias: alias,
        status: "unverified",
      };

      await createIncident(payload);

      setDescription("");
      setLocationText("");
      setStillHappeningChoice("unset");
      setPoliceSeenChoice("unset");
      setFeelSafeChoice("unset");
      setContactedAuthorities("unknown");
      setSafetySentiment(null);
      setAlias("");
      setSuccess(true);

      if (onCreated) onCreated();
    } catch (error) {
      console.error(error);
      setErr("Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-lg backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-2 xs:flex-row xs:items-start xs:justify-between xs:gap-4 md:items-center">
        <div>
          <h2 className="text-base font-semibold text-ink xs:text-lg md:text-xl">Share a community signal</h2>
          <p className="text-xs text-slate-500 xs:text-sm md:text-base">
            Photos/video optional. Block-level privacy by default.
          </p>
        </div>
        {taxonomyLoading && <span className="text-[10px] text-slate-400">Loading taxonomy…</span>}
      </div>

      {taxonomyError && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {taxonomyError}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-600">
          Thank you! Stay tuned for follow-up prompts.
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {err}
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600">Category</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
          >
            {Object.entries(taxonomyData).map(([key, group]) => (
              <optgroup key={key} label={group.label}>
                {(group.items || []).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <SegmentedControl
          label="Signal Type"
          value={incidentType}
          onChange={(value) => value && setIncidentType(value)}
          options={INCIDENT_TYPES}
          allowUnset={false}
        />

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600">What happened?</label>
          <textarea
            required
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
            placeholder="Describe what you observed…"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600">Where (block / landmark only)?</label>
          <input
            value={locationText}
            onChange={(event) => setLocationText(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
            placeholder="Near 14th &amp; U St NW"
          />
        </div>

        <div className="grid gap-4 rounded-3xl bg-white/60 p-4 xs:p-5 md:grid-cols-2">
          <PromptControl
            label="Is it still happening?"
            value={stillHappeningChoice}
            onChange={setStillHappeningChoice}
          />
          <PromptControl
            label="Do you feel safe now?"
            value={feelSafeChoice}
            onChange={setFeelSafeChoice}
          />
          <PromptControl
            label="Did you contact or see authorities?"
            value={policeSeenChoice}
            onChange={setPoliceSeenChoice}
          />
          <SegmentedControl
            label="Contacted authorities via"
            value={contactedAuthorities}
            onChange={setContactedAuthorities}
            options={CONTACTED_OPTIONS}
            allowUnset={false}
          />
        </div>

        <SegmentedControl
          label="Safety sentiment"
          value={safetySentiment}
          onChange={setSafetySentiment}
          options={SENTIMENT_OPTIONS}
        />

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600">Alias (optional)</label>
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
            placeholder="Neighborhood scout"
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Structured prompts answered: <strong>{structuredResponses}</strong> / 3
          </span>
          <span>{categories.length} available categories</span>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-ink/20 transition hover:bg-[#111522] disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </section>
  );
}
