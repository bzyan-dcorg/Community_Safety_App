import { useEffect, useMemo, useState } from "react";
import { createComment, createFollowUp, setCommentReaction, setIncidentReaction, updateIncident } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { IncidentMapPreview } from "./IncidentMapPreview.jsx";

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
const VERIFIER_ROLES = new Set(["admin", "staff", "officer"]);

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

const MAX_COMMENT_MEDIA = 3;

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Invalid file result"));
        return;
      }
      const [prefix, base64] = reader.result.split(",", 2);
      const mediaType = file.type.startsWith("video") ? "video" : "image";
      resolve({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        dataUrl: reader.result,
        base64: base64 || reader.result,
        filename: file.name,
        contentType: file.type || (mediaType === "image" ? "image/*" : "video/*"),
        mediaType,
      });
    };
    reader.readAsDataURL(file);
  });
}

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

export default function IncidentCard({ incident, onMutated, onRequireAuth = () => {} }) {
  const { authenticated, user } = useAuth();
  const [showComposer, setShowComposer] = useState(false);
  const [notes, setNotes] = useState("");
  const [followStatus, setFollowStatus] = useState(incident.status || "unverified");
  const [followStillHappening, setFollowStillHappening] = useState(incident.still_happening);
  const [followFeelSafe, setFollowFeelSafe] = useState(incident.feel_safe_now);
  const [followContacted, setFollowContacted] = useState(incident.contacted_authorities || "unknown");
  const [followSentiment, setFollowSentiment] = useState(incident.safety_sentiment || "unsure");
  const derivedFollowAlias = useMemo(() => {
    if (user?.display_name) return user.display_name;
    if (user?.email) return user.email.split("@")[0];
    return "Community member";
  }, [user?.display_name, user?.email]);
  const [followAlias, setFollowAlias] = useState(derivedFollowAlias);

  const [composeLoading, setComposeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSuccess, setCommentSuccess] = useState("");
  const [comments, setComments] = useState(incident.comments || []);
  const [commentMedia, setCommentMedia] = useState([]);
  const [commentReactionUpdating, setCommentReactionUpdating] = useState(null);
  const [reactionState, setReactionState] = useState({
    likesCount: incident.likes_count || 0,
    unlikesCount: incident.unlikes_count || 0,
    viewerReaction: incident.viewer_reaction || null,
  });
  const [reactionLoading, setReactionLoading] = useState(false);
  const [reactionError, setReactionError] = useState("");
  const canVerify = Boolean(user?.role && VERIFIER_ROLES.has(user.role));

  const credibilityPercent = useMemo(() => {
    if (typeof incident.credibility_score !== "number") return 0;
    return Math.round(incident.credibility_score * 100);
  }, [incident.credibility_score]);

  const followUps = incident.follow_ups || [];
  const followUpDue = incident.follow_up_due_at ? new Date(incident.follow_up_due_at) : null;
  const followUpOverdue = followUpDue ? followUpDue.getTime() <= Date.now() : false;
  const reporterName = incident.reporter_alias || incident.reporter?.display_name || "Community member";
  const rewardPointsEarned = incident.reward_points_awarded || 0;
  const hasMapPin = typeof incident.lat === "number" && typeof incident.lng === "number";
  const mapLink = hasMapPin
    ? `https://www.openstreetmap.org/?mlat=${incident.lat}&mlon=${incident.lng}#map=17/${incident.lat}/${incident.lng}`
    : null;
  const incidentMedia = incident.media || [];

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

  useEffect(() => {
    setComments(incident.comments || []);
  }, [incident.comments]);

  useEffect(() => {
    if (!authenticated && showComposer) {
      setShowComposer(false);
    }
  }, [authenticated, showComposer]);

  useEffect(() => {
    if (!showComposer) {
      setFollowAlias(derivedFollowAlias);
    }
  }, [derivedFollowAlias, showComposer]);

  useEffect(() => {
    setReactionState({
      likesCount: incident.likes_count || 0,
      unlikesCount: incident.unlikes_count || 0,
      viewerReaction: incident.viewer_reaction || null,
    });
  }, [incident.likes_count, incident.unlikes_count, incident.viewer_reaction]);

  useEffect(() => {
    if (commentBody || commentMedia.length > 0) {
      setCommentError("");
      setCommentSuccess("");
    }
  }, [commentBody, commentMedia]);

  const canPostComment = commentBody.trim().length > 0;

  async function handleCommentFilesChange(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }
    if (commentMedia.length + files.length > MAX_COMMENT_MEDIA) {
      setCommentError(`You can attach up to ${MAX_COMMENT_MEDIA} items per comment.`);
      return;
    }
    try {
      const processed = await Promise.all(
        files.map((file) => {
          if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
            throw new Error("Only images or videos are supported.");
          }
          return readFileAsDataURL(file);
        }),
      );
      setCommentMedia((prev) => [...prev, ...processed]);
    } catch (err) {
      console.error(err);
      setCommentError(err?.message || "Unable to read attachments.");
    } finally {
      event.target.value = "";
    }
  }

  function handleRemoveCommentMedia(id) {
    setCommentMedia((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleCommentSubmit(event) {
    event.preventDefault();
    if (!authenticated) {
      onRequireAuth("login");
      return;
    }
    const body = commentBody.trim();
    if (!body) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    setCommentLoading(true);
    setCommentError("");
    setCommentSuccess("");
    try {
      const mediaPayload = commentMedia.map((item) => ({
        media_type: item.mediaType,
        content_type: item.contentType,
        data_base64: item.base64,
        filename: item.filename,
      }));
      const created = await createComment(incident.id, {
        body,
        media: mediaPayload,
      });
      setCommentBody("");
      setCommentMedia([]);
      setComments((prev) => [created, ...prev]);
      setCommentSuccess("Comment posted.");
      if (onMutated) onMutated();
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || "Unable to add comment.";
      setCommentError(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally {
      setCommentLoading(false);
    }
  }

  async function handleReaction(action) {
    if (!authenticated) {
      onRequireAuth("login");
      return;
    }
    const nextAction = reactionState.viewerReaction === action ? "clear" : action;
    setReactionLoading(true);
    setReactionError("");
    try {
      const result = await setIncidentReaction(incident.id, nextAction);
      setReactionState({
        likesCount: result.likes_count,
        unlikesCount: result.unlikes_count,
        viewerReaction: result.viewer_reaction,
      });
      if (onMutated) onMutated();
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || "Unable to update reaction.";
      setReactionError(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally {
      setReactionLoading(false);
    }
  }

  async function handleCommentReaction(commentId, action) {
    if (!authenticated) {
      onRequireAuth("login");
      return;
    }
    setCommentError("");
    setCommentReactionUpdating(commentId);
    try {
      const target = comments.find((item) => item.id === commentId);
      const currentReaction = target?.viewer_reaction || null;
      const nextAction = currentReaction === action ? "clear" : action;
      const updated = await setCommentReaction(incident.id, commentId, nextAction);
      setComments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (onMutated) onMutated();
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail || "Unable to update comment reaction.";
      setCommentError(Array.isArray(detail) ? detail.join(", ") : detail);
    } finally {
      setCommentReactionUpdating(null);
    }
  }

  async function handleMarkResolved() {
    if (!canVerify) {
      onRequireAuth("login", "officer");
      return;
    }
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

  function handleToggleFollowComposer() {
    if (!authenticated) {
      onRequireAuth("login");
      return;
    }
    setError("");
    setSuccess("");
    setShowComposer((prev) => !prev);
  }

  async function handleFollowUpSubmit(event) {
    event.preventDefault();
    if (!authenticated) {
      onRequireAuth("login");
      return;
    }
    setComposeLoading(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        notes: notes.trim() || undefined,
        still_happening: followStillHappening,
        feel_safe_now: followFeelSafe,
        contacted_authorities: followContacted,
        safety_sentiment: followSentiment,
        created_by: followAlias.trim() || undefined,
      };
      if (canVerify) {
        payload.status = followStatus;
      }
      await createFollowUp(incident.id, payload);
      setNotes("");
      setShowComposer(false);
      setSuccess("Follow-up shared.");
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
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="font-medium text-ink">Reported by {reporterName}</span>
            {rewardPointsEarned > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                {rewardPointsEarned} pts earned
              </span>
            )}
          </div>
          {(hasMapPin || incidentMedia.length > 0) && (
            <div className="mt-3 space-y-3">
              {hasMapPin && (
                <IncidentMapPreview
                  lat={incident.lat}
                  lng={incident.lng}
                  locationText={incident.location_text}
                  fallbackLink={mapLink}
                />
              )}

              {incidentMedia.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                    Uploads
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {incidentMedia.map((media) => (
                      <div
                        key={media.id}
                        className="h-20 w-20 overflow-hidden rounded-2xl border border-white/80 bg-slate-100 shadow-inner"
                      >
                        {media.media_type === "image" ? (
                          <img
                            src={`data:${media.content_type};base64,${media.data_base64}`}
                            alt={media.filename || "Attachment"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <video
                            src={`data:${media.content_type};base64,${media.data_base64}`}
                            className="h-full w-full object-cover"
                            controls
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
            {authenticated ? (
              <>
                <button
                  onClick={handleToggleFollowComposer}
                  className="rounded-full border border-slate-200 px-3 py-2 font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
                >
                  {showComposer ? "Cancel" : "Add follow-up"}
                </button>
                {canVerify ? (
                  <button
                    onClick={handleMarkResolved}
                    disabled={actionLoading || incident.status === "resolved"}
                    className="rounded-full bg-ink px-3 py-2 font-medium text-white shadow-soft transition hover:bg-[#121420] disabled:opacity-50"
                  >
                    {actionLoading ? "Updating…" : "Mark resolved"}
                  </button>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-3 py-2 text-slate-500">
                    Follow-ups from residents help moderators confirm incidents. Only staff can mark them resolved.
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => onRequireAuth("login")}
                className="rounded-full border border-slate-200 px-3 py-2 font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
              >
                Sign in to add follow-ups
              </button>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleReaction("like")}
                disabled={reactionLoading}
                className={`flex items-center gap-1 rounded-full px-3 py-2 text-[11px] font-medium transition ${
                  reactionState.viewerReaction === "like"
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>Like</span>
                <span className="font-semibold">{reactionState.likesCount}</span>
              </button>
              <button
                type="button"
                onClick={() => handleReaction("unlike")}
                disabled={reactionLoading}
                className={`flex items-center gap-1 rounded-full px-3 py-2 text-[11px] font-medium transition ${
                  reactionState.viewerReaction === "unlike"
                    ? "bg-rose-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>Unlike</span>
                <span className="font-semibold">{reactionState.unlikesCount}</span>
              </button>
            </div>
            {reactionError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] text-rose-600">
                {reactionError}
              </div>
            )}
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

      {authenticated && showComposer && (
        <form onSubmit={handleFollowUpSubmit} className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white/80 p-4 xs:p-5">
          <h4 className="text-sm font-semibold text-ink xs:text-base">Record a follow-up</h4>
          {canVerify && <Segmented value={followStatus} onChange={setFollowStatus} options={STATUS_OPTIONS} />}
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {(entry.still_happening === true || entry.still_happening === false) && (
                    <PromptChip label="Ongoing" value={entry.still_happening ? "yes" : "no"} />
                  )}
                  {(entry.feel_safe_now === true || entry.feel_safe_now === false) && (
                    <PromptChip label="Feels safe" value={entry.feel_safe_now ? "yes" : "no"} />
                  )}
                  {entry.contacted_authorities && (
                    <PromptChip label="Authorities" value={entry.contacted_authorities} />
                  )}
                  {entry.safety_sentiment && (
                    <PromptChip label="Sentiment" value={entry.safety_sentiment} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-4 xs:p-5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-ink xs:text-base">Neighborhood chat</h4>
          {comments.length > 0 && (
            <span className="text-[11px] text-slate-500">
              {comments.length} {comments.length === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>

        {authenticated ? (
          <form onSubmit={handleCommentSubmit} className="mt-4 space-y-3">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              rows={3}
              disabled={commentLoading}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none disabled:opacity-50"
              placeholder="Share what you're seeing or how neighbors can help."
            />
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleCommentFilesChange}
                className="w-full cursor-pointer rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-3 text-[11px] text-slate-500 transition hover:border-slate-400 focus:outline-none disabled:opacity-50"
                disabled={commentLoading}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Images or short clips. Max {MAX_COMMENT_MEDIA} attachments.</span>
                <span>
                  {commentMedia.length}/{MAX_COMMENT_MEDIA}
                </span>
              </div>
              {commentMedia.length > 0 && (
                <div className="grid gap-3 xs:grid-cols-2">
                  {commentMedia.map((item) => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-2"
                    >
                      {item.mediaType === "image" ? (
                        <img
                          src={item.dataUrl}
                          alt={item.filename}
                          className="h-32 w-full rounded-xl object-cover"
                        />
                      ) : (
                        <video
                          src={item.dataUrl}
                          controls
                          className="h-32 w-full rounded-xl bg-black object-cover"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveCommentMedia(item.id)}
                        className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                      >
                        Remove
                      </button>
                      <p className="mt-2 truncate text-[10px] text-slate-500">{item.filename}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 xs:flex-row xs:items-center xs:justify-between">
              <span className="text-[11px] text-slate-500">
                Posting as {user?.display_name || user?.email || "you"}
              </span>
              <button
                type="submit"
                disabled={!canPostComment || commentLoading}
                className="rounded-full bg-ink px-4 py-2 text-[11px] font-semibold text-white shadow-soft transition hover:bg-[#121420] disabled:opacity-50"
              >
                {commentLoading ? "Posting…" : "Post comment"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => onRequireAuth("login")}
            className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
          >
            Sign in to share your perspective
          </button>
        )}

        {commentError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
            {commentError}
          </div>
        )}
        {commentSuccess && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-600">
            {commentSuccess}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {comments.length > 0 ? (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-2xl border border-white/60 bg-slate-50/80 px-4 py-3 text-sm text-slate-600 shadow-inner"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{comment.user?.display_name || "Neighbor"}</span>
                  <span>{formatTimestamp(comment.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{comment.body}</p>
                {comment.attachments?.length > 0 && (
                  <div className="mt-3 grid gap-3 xs:grid-cols-2">
                    {comment.attachments.map((attachment) => {
                      const contentType =
                        attachment.content_type || (attachment.media_type === "video" ? "video/mp4" : "image/png");
                      const src = `data:${contentType};base64,${attachment.data_base64}`;
                      return (
                        <div
                          key={attachment.id}
                          className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 p-2"
                        >
                          {attachment.media_type === "image" ? (
                            <img
                              src={src}
                              alt={attachment.filename || "comment media"}
                              className="h-32 w-full rounded-xl object-cover"
                            />
                          ) : (
                            <video src={src} controls className="h-32 w-full rounded-xl bg-black object-cover" />
                          )}
                          {attachment.filename && (
                            <p className="mt-2 truncate text-[10px] text-slate-500">{attachment.filename}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <button
                    type="button"
                    onClick={() => handleCommentReaction(comment.id, "like")}
                    disabled={commentReactionUpdating === comment.id}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 font-medium transition ${
                      comment.viewer_reaction === "like"
                        ? "bg-emerald-500 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>Like</span>
                    <span className="font-semibold">{comment.likes_count || 0}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCommentReaction(comment.id, "unlike")}
                    disabled={commentReactionUpdating === comment.id}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 font-medium transition ${
                      comment.viewer_reaction === "unlike"
                        ? "bg-rose-500 text-white"
                        : "bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <span>Unlike</span>
                    <span className="font-semibold">{comment.unlikes_count || 0}</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500">No comments yet. Start the conversation.</p>
          )}
        </div>
      </div>
    </article>
  );
}
