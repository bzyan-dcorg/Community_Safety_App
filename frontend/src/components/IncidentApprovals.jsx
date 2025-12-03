import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchIncidents, updateIncidentStatus } from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

const APPROVAL_STATUSES = [
  { id: "community-confirmed", label: "Community Confirmed" },
  { id: "official-confirmed", label: "Official Confirmed" },
  { id: "resolved", label: "Resolved" },
  { id: "unverified", label: "Revert to Unverified" },
];
const APPROVER_ROLES = new Set(["officer", "staff", "admin"]);

export default function IncidentApprovals() {
  const { user } = useAuth();
  const canApprove = useMemo(() => (user?.role ? APPROVER_ROLES.has(user.role) : false), [user?.role]);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const loadIncidents = useCallback(async () => {
    if (!canApprove) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchIncidents({
        limit: 10,
        status_filter: "unverified",
      });
      setIncidents(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load incidents.");
    } finally {
      setLoading(false);
    }
  }, [canApprove]);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  if (!canApprove) {
    return null;
  }

  const handleStatusChange = async (incidentId, status) => {
    setUpdatingId(incidentId);
    try {
      await updateIncidentStatus(incidentId, status);
      await loadIncidents();
    } catch (err) {
      console.error(err);
      setError("Unable to update incident status.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="mx-auto mb-8 flex max-w-7xl flex-col gap-3 px-4 xs:px-6 sm:px-8 lg:px-10">
      <div className="rounded-3xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur-sm sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink sm:text-lg">Incident Approvals</h3>
            <p className="text-xs text-slate-500 sm:text-sm">
              Review unverified incidents and promote them to confirmed or resolved states.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink"
            onClick={loadIncidents}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-sm text-rose-500">{error}</p>
        ) : incidents.length === 0 ? (
          <p className="text-sm text-slate-500">No incidents need review.</p>
        ) : (
          <ul className="space-y-3">
            {incidents.map((incident) => (
              <li key={incident.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">
                      #{incident.id} · {incident.category}
                    </p>
                    <p className="text-xs text-slate-500">
                      Reporter: {incident.reporter?.display_name || incident.reporter?.email || "Anonymous"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {APPROVAL_STATUSES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                          incident.status === option.id
                            ? "border border-ink text-ink bg-slate-50"
                            : "border border-slate-200 text-slate-600 hover:border-ink hover:text-ink"
                        }`}
                        disabled={updatingId === incident.id}
                        onClick={() => handleStatusChange(incident.id, option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-slate-600">{incident.description}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
