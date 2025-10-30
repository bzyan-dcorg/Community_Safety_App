import { useEffect, useState } from "react";
import { fetchIncidents } from "../api.js";
import IncidentCard from "./IncidentCard.jsx";

export default function IncidentList({
  incidentType,
  statusFilter,
  refreshToken,
  onMutated,
  onRequireAuth = () => {},
}) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchIncidents({
        limit: 80,
        incident_type: incidentType,
        status_filter: statusFilter,
      });
      setIncidents(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load incidents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentType, statusFilter, refreshToken]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-center sm:text-left">
          Showing <strong>{incidents.length}</strong> threads
        </span>
        <button
          className="w-full rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink sm:w-auto"
          onClick={load}
        >
          Refresh list
        </button>
      </div>

      {loading && <div className="text-sm text-slate-500">Loading…</div>}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
          {error}
        </div>
      )}

      {!loading && incidents.length === 0 && !error && (
        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-6 text-sm text-slate-500">
          No incidents yet. Encourage neighbors to share what they are seeing.
        </div>
      )}

      {incidents.map((incident) => (
        <IncidentCard
          key={incident.id}
          incident={incident}
          onMutated={onMutated}
          onRequireAuth={onRequireAuth}
        />
      ))}
    </div>
  );
}
