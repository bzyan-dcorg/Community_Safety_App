import { useEffect, useMemo, useState } from "react";
import { createIncident } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { MapLocationPicker } from "./MapLocationPicker.jsx";

const DEFAULT_TAXONOMY = {
  community_civic: {
    label: "Neighborhood Activities",
    items: ["Community activities or programs", "Conflict mediation or disputes"],
  },
  police_related: {
    label: "City & Staff Sightings",
    items: ["Sightings of city workers"],
  },
  public_order: {
    label: "Safety Pulse",
    items: ["Perceived safety shift", "Public space or infrastructure watch"],
  },
};
const DEFAULT_CATEGORY = DEFAULT_TAXONOMY.community_civic.items[0];

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

const MAX_MEDIA_ATTACHMENTS = 3;

function readFileAsPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Invalid file result"));
        return;
      }
      const [, base64] = reader.result.split(",", 2);
      const isVideo = file.type.startsWith("video");
      resolve({
        id: `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        media_type: isVideo ? "video" : "image",
        content_type: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
        data_base64: base64 || reader.result,
        filename: file.name,
        previewUrl: reader.result,
      });
    };
    reader.readAsDataURL(file);
  });
}

function generateNearbyPrompts(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return [];
  const roundedLat = lat.toFixed(3);
  const roundedLng = lng.toFixed(3);
  const quadrant = lat >= 0 ? "N" : "S";
  const eastWest = lng >= 0 ? "E" : "W";
  return [
    `Did you notice city staff or contractors near ${roundedLat}°${quadrant} / ${roundedLng}°${eastWest}?`,
    "Would additional lighting, traffic calming, or mediation help here?",
    "Snap a quick photo so verifiers understand what equipment or crowd size they should expect.",
  ];
}

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

export default function IncidentForm({
  taxonomy,
  taxonomyLoading,
  taxonomyError,
  onCreated,
  onRequireAuth = () => {},
}) {
  const { authenticated, user } = useAuth();
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [incidentType, setIncidentType] = useState("community");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [stillHappeningChoice, setStillHappeningChoice] = useState("unset");
  const [policeSeenChoice, setPoliceSeenChoice] = useState("unset");
  const [feelSafeChoice, setFeelSafeChoice] = useState("unset");
  const [contactedAuthorities, setContactedAuthorities] = useState("unknown");
  const [safetySentiment, setSafetySentiment] = useState(null);
  const [alias, setAlias] = useState("");
  const [mediaUploads, setMediaUploads] = useState([]);
  const [mediaError, setMediaError] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  const taxonomyData = taxonomy || DEFAULT_TAXONOMY;

  const categoryGroups = useMemo(() => {
    if (!taxonomyData) return [];
    const groups = [];
    if (taxonomyData?.police_related?.items?.length) {
      groups.push({
        label: taxonomyData.police_related.label,
        items: taxonomyData.police_related.items,
      });
    }
    if (taxonomyData?.community_civic?.items?.length) {
      groups.push({
        label: taxonomyData.community_civic.label,
        items: taxonomyData.community_civic.items,
      });
    }
    if (taxonomyData?.public_order?.items?.length) {
      groups.push({
        label: taxonomyData.public_order.label,
        items: taxonomyData.public_order.items,
      });
    }
    return groups;
  }, [taxonomyData]);

  const categories = useMemo(() => {
    return categoryGroups.flatMap((group) => group.items);
  }, [categoryGroups]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }
    setCategory((prev) => (categories.includes(prev) ? prev : categories[0]));
  }, [categories]);

  const structuredResponses = [stillHappeningChoice, policeSeenChoice, feelSafeChoice].filter(
    (value) => value !== "unset"
  ).length;

  const nearbyPrompts = useMemo(() => generateNearbyPrompts(lat, lng), [lat, lng]);

  async function handleMediaChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setMediaError("");
    try {
      const availableSlots = MAX_MEDIA_ATTACHMENTS - mediaUploads.length;
      if (availableSlots <= 0) {
        setMediaError("You can attach up to three files.");
        return;
      }
      const queue = files.slice(0, availableSlots);
      const payloads = await Promise.all(queue.map((file) => readFileAsPayload(file)));
      setMediaUploads((prev) => [...prev, ...payloads]);
    } catch (error) {
      console.error(error);
      setMediaError("Unable to attach that file.");
    } finally {
      if (event.target) {
        event.target.value = "";
      }
    }
  }

  function handleRemoveMedia(id) {
    setMediaUploads((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!authenticated) {
      setErr("Please sign in to submit incidents.");
      onRequireAuth("login");
      return;
    }

    setSubmitting(true);
    setErr("");
    setSuccess(false);

    try {
      const aliasValue = (alias || "").trim() || user?.display_name || undefined;
      const payload = {
        category,
        incident_type: incidentType,
        description,
        location_text: locationText,
        lat: typeof lat === "number" ? lat : null,
        lng: typeof lng === "number" ? lng : null,
        still_happening: normalizePrompt(stillHappeningChoice),
        police_seen: normalizePrompt(policeSeenChoice),
        feel_safe_now: normalizePrompt(feelSafeChoice),
        contacted_authorities: contactedAuthorities,
        safety_sentiment: safetySentiment,
        reporter_alias: aliasValue,
        status: "unverified",
        media: mediaUploads.map((upload) => ({
          media_type: upload.media_type,
          content_type: upload.content_type,
          data_base64: upload.data_base64,
          filename: upload.filename,
        })),
      };

      await createIncident(payload);

      setDescription("");
      setLocationText("");
      setLat(null);
      setLng(null);
      setStillHappeningChoice("unset");
      setPoliceSeenChoice("unset");
      setFeelSafeChoice("unset");
      setContactedAuthorities("unknown");
      setSafetySentiment(null);
      setAlias("");
      setMediaUploads([]);
      setSuccess(true);

      if (onCreated) onCreated();
    } catch (error) {
      console.error(error);
      const detail = error?.response?.data?.detail || "Failed to submit report. Please try again.";
      setErr(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally {
      setSubmitting(false);
    }
  }

  if (!authenticated) {
    return (
      <section className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-600 shadow-inner">
        <h2 className="text-lg font-semibold text-ink">Sign in to share a community signal</h2>
        <p className="mt-2">
          Every confirmed, high-signal report earns reward points that unlock neighborhood membership perks and future
          discounts. Create an account to start building your reputation.
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-2xl bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#111522]"
          onClick={() => onRequireAuth("login")}
        >
          Sign in to report
        </button>
      </section>
    );
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
          Thank you! We&apos;ll nudge verifiers right away and credit your reward points once this signal is confirmed.
        </div>
      )}

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {err}
        </div>
      )}

      <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-600" htmlFor="incident-category">
            Category
          </label>
          <select
            id="incident-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
          >
            {categoryGroups.length === 0 ? (
              <option value={category || ""}>{category || "Select a category"}</option>
            ) : (
              categoryGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
          <p className="text-[11px] text-slate-500">
            Choose the closest match; share extra detail in the description.
          </p>
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
          <label className="text-xs font-semibold text-slate-600">Drop a map pin</label>
          <MapLocationPicker
            lat={lat}
            lng={lng}
            locationText={locationText}
            onLocationTextChange={setLocationText}
            onChange={({ lat: nextLat, lng: nextLng }) => {
              setLat(nextLat);
              setLng(nextLng);
            }}
          />
        </div>

        {nearbyPrompts.length > 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-ink">Nearby prompts</p>
            <ul className="mt-2 space-y-1">
              {nearbyPrompts.map((prompt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-0.5 text-slate-400">•</span>
                  <span>{prompt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
          <label className="text-xs font-semibold text-slate-600">Optional photo or short clip</label>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleMediaChange}
            className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
          />
          {mediaError && <p className="text-xs text-rose-600">{mediaError}</p>}
          {mediaUploads.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {mediaUploads.map((media) => (
                <div
                  key={media.id}
                  className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/70 bg-slate-100 shadow-inner"
                >
                  {media.media_type === "image" ? (
                    <img
                      src={media.previewUrl}
                      alt={media.filename}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video src={media.previewUrl} className="h-full w-full object-cover" muted />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(media.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/60 px-1 text-[10px] font-semibold text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">Up to {MAX_MEDIA_ATTACHMENTS} files.</p>
        </div>

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
