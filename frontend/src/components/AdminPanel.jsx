import { useCallback, useEffect, useState } from "react";
import {
  decideRoleRequest,
  fetchIncidents,
  fetchRoleRequests,
  searchUsers,
  setCommentVisibility,
  setIncidentVisibility,
  updateUserRewards,
} from "../api.js";
import { useAuth } from "../context/AuthContext.jsx";

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-3xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink sm:text-lg">{title}</h3>
          <p className="text-xs text-slate-500 sm:text-sm">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [roleRequests, setRoleRequests] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [incidentError, setIncidentError] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [rewardInputs, setRewardInputs] = useState({});

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    setRequestsLoading(true);
    setRequestError("");
    try {
      const data = await fetchRoleRequests({ status_filter: "pending", limit: 25 });
      setRoleRequests(data);
    } catch (error) {
      console.error(error);
      setRequestError("Unable to load role requests");
    } finally {
      setRequestsLoading(false);
    }
  }, [isAdmin]);

  const loadIncidents = useCallback(async () => {
    if (!isAdmin) return;
    setIncidentLoading(true);
    setIncidentError("");
    try {
      const data = await fetchIncidents({ limit: 10, include_hidden: true });
      setIncidents(data);
    } catch (error) {
      console.error(error);
      setIncidentError("Unable to load incidents");
    } finally {
      setIncidentLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadRequests();
      loadIncidents();
    }
  }, [isAdmin, loadRequests, loadIncidents]);

  if (!isAdmin) {
    return null;
  }

  const handleRoleDecision = async (requestId, action) => {
    try {
      await decideRoleRequest(requestId, { action });
      await loadRequests();
    } catch (error) {
      console.error(error);
      setRequestError("Decision failed. Please try again.");
    }
  };

  const toggleIncidentVisibility = async (incidentId, hidden) => {
    try {
      await setIncidentVisibility(incidentId, hidden);
      await loadIncidents();
    } catch (error) {
      console.error(error);
      setIncidentError("Unable to update incident status");
    }
  };

  const toggleCommentVisibility = async (incidentId, commentId, hidden) => {
    try {
      await setCommentVisibility(incidentId, commentId, hidden);
      await loadIncidents();
    } catch (error) {
      console.error(error);
      setIncidentError("Unable to update comment status");
    }
  };

  const handleUserSearch = async () => {
    if (!userQuery.trim()) {
      setUserResults([]);
      setRewardInputs({});
      return;
    }
    setUserLoading(true);
    setUserError("");
    try {
      const data = await searchUsers({ query: userQuery.trim(), limit: 25 });
      setUserResults(data);
      const seed = {};
      data.forEach((item) => {
        seed[item.id] = String(item.reward_points ?? 0);
      });
      setRewardInputs(seed);
    } catch (error) {
      console.error(error);
      setUserError("Unable to fetch users.");
    } finally {
      setUserLoading(false);
    }
  };

  const handleRewardInput = (userId, value) => {
    setRewardInputs((prev) => ({
      ...prev,
      [userId]: value,
    }));
  };

  const handleRewardSave = async (userId) => {
    const rawValue = rewardInputs[userId];
    if (rawValue === undefined) {
      return;
    }
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setUserError("Reward points must be a non-negative number.");
      return;
    }
    setUserError("");
    try {
      await updateUserRewards(userId, parsed);
      await handleUserSearch();
    } catch (error) {
      console.error(error);
      setUserError("Unable to update reward points.");
    }
  };

  return (
    <div className="mx-auto mb-8 flex max-w-7xl flex-col gap-4 px-4 xs:px-6 sm:px-8 lg:px-10">
      <div className="rounded-3xl bg-ink px-5 py-3 text-sm text-white shadow-lg sm:flex sm:items-center sm:justify-between">
        <div className="font-semibold">Admin Quick Actions</div>
        <p className="text-xs text-slate-200">Approve role requests and hide/restore incidents or comments.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Role Request Review" description="Review and approve the latest upgrade requests.">
          {requestsLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : requestError ? (
            <p className="text-sm text-rose-500">{requestError}</p>
          ) : roleRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No pending requests.</p>
          ) : (
            <ul className="space-y-3">
              {roleRequests.map((request) => (
                <li key={request.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">
                        {request.user?.display_name || request.user?.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        Requested role: {request.requested_role} · Current: {request.user?.role}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50"
                        onClick={() => handleRoleDecision(request.id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-rose-500 px-3 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50"
                        onClick={() => handleRoleDecision(request.id, "deny")}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                  {request.justification ? (
                    <p className="mt-2 rounded-2xl bg-slate-50 p-2 text-xs text-slate-600">
                      {request.justification}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Incident / Comment Visibility" description="Hide or restore incidents and their comments.">
          {incidentLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : incidentError ? (
            <p className="text-sm text-rose-500">{incidentError}</p>
          ) : incidents.length === 0 ? (
            <p className="text-sm text-slate-500">No incidents available.</p>
          ) : (
            <ul className="space-y-3">
              {incidents.map((incident) => (
                <li key={incident.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">
                        #{incident.id} · {incident.category}
                      </p>
                      <p className="text-xs text-slate-500">
                        Status: {incident.status} · {incident.is_hidden ? "Hidden" : "Visible"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        incident.is_hidden
                          ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                          : "border border-rose-500 text-rose-500 hover:bg-rose-50"
                      }`}
                      onClick={() => toggleIncidentVisibility(incident.id, !incident.is_hidden)}
                    >
                      {incident.is_hidden ? "Unhide" : "Hide incident"}
                    </button>
                  </div>
                  {incident.comments?.length ? (
                    <details className="mt-2 rounded-2xl bg-slate-50 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                        Comments ({incident.comments.length})
                      </summary>
                      <div className="mt-2 space-y-2">
                        {incident.comments.slice(0, 4).map((comment) => (
                          <div key={comment.id} className="rounded-2xl border border-slate-200 bg-white p-2">
                            <p className="text-xs text-slate-600">{comment.body}</p>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                              <span>{comment.user?.display_name || comment.user?.email}</span>
                              <button
                                type="button"
                                className={`rounded-full px-2 py-0.5 transition ${
                                  comment.is_hidden
                                    ? "border border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                                    : "border border-rose-400 text-rose-500 hover:bg-rose-50"
                                }`}
                                onClick={() =>
                                  toggleCommentVisibility(incident.id, comment.id, !comment.is_hidden)
                                }
                              >
                                {comment.is_hidden ? "Unhide" : "Hide"}
                              </button>
                            </div>
                          </div>
                        ))}
                        {incident.comments.length > 4 ? (
                          <p className="text-[11px] text-slate-500">Showing first 4 comments.</p>
                        ) : null}
                      </div>
                    </details>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">No comments.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="User Rewards Control" description="Search any user and adjust their reward points.">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            placeholder="Search by email or display name"
            className="flex-1 rounded-2xl border border-slate-200 px-3 py-2 text-sm focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-ink"
            onClick={handleUserSearch}
            disabled={userLoading}
          >
            {userLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {userError ? <p className="text-sm text-rose-500">{userError}</p> : null}
        {userResults.length === 0 && !userLoading ? (
          <p className="text-sm text-slate-500">No users to display.</p>
        ) : (
          <ul className="space-y-3">
            {userResults.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{item.display_name || "Unnamed"}</p>
                    <p className="text-xs text-slate-500">
                      {item.email} · {item.role}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={rewardInputs[item.id] ?? item.reward_points ?? 0}
                      onChange={(event) => handleRewardInput(item.id, event.target.value)}
                      className="w-24 rounded-2xl border border-slate-200 px-3 py-1 text-sm focus:border-ink focus:outline-none"
                    />
                    <button
                      type="button"
                      className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
                      onClick={() => handleRewardSave(item.id)}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
