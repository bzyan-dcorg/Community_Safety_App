import axios from "axios";

function resolveApiBase() {
  const explicit = import.meta.env?.VITE_API_BASE_URL;
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const devProxyEnabled =
    import.meta.env?.DEV && import.meta.env?.VITE_DISABLE_DEV_PROXY !== "1";
  if (devProxyEnabled) {
    return "/api";
  }

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const port = import.meta.env?.VITE_API_PORT ?? "8000";
    const portSegment = port ? `:${port.replace(/^:/, "")}` : "";
    return `${protocol}//${hostname}${portSegment}`.replace(/\/$/, "");
  }

  return "http://127.0.0.1:8000";
}

const API_BASE = resolveApiBase();

export const apiClient = axios.create({
  baseURL: API_BASE,
});

export function setAuthToken(token) {
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

function sanitizeParams(params) {
  const filtered = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      filtered[key] = value;
    }
  });
  return filtered;
}

export async function fetchIncidents(params = {}) {
  const resp = await apiClient.get("/incidents/", {
    params: sanitizeParams(params),
  });
  return resp.data;
}

export async function fetchIncident(id) {
  const resp = await apiClient.get(`/incidents/${id}`);
  return resp.data;
}

export async function createIncident(data) {
  const resp = await apiClient.post("/incidents/", data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function updateIncident(id, data) {
  const resp = await apiClient.patch(`/incidents/${id}`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function createFollowUp(id, data) {
  const resp = await apiClient.post(`/incidents/${id}/follow-ups`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function fetchTaxonomy() {
  const resp = await apiClient.get("/taxonomy/");
  return resp.data;
}

export async function fetchStats() {
  const resp = await apiClient.get("/incidents/stats");
  return resp.data;
}

export async function registerEmail(data) {
  const resp = await apiClient.post("/auth/register", data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function loginEmail(data) {
  const resp = await apiClient.post("/auth/login", data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function loginWithProvider(data) {
  const resp = await apiClient.post("/auth/oauth", data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function fetchProfile() {
  const resp = await apiClient.get("/auth/me");
  return resp.data;
}

export async function createComment(incidentId, data) {
  const resp = await apiClient.post(`/incidents/${incidentId}/comments`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function setIncidentReaction(incidentId, action) {
  const resp = await apiClient.post(`/incidents/${incidentId}/reactions`, { action }, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function setCommentReaction(incidentId, commentId, action) {
  const resp = await apiClient.post(`/incidents/${incidentId}/comments/${commentId}/reactions`, { action }, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function fetchNotifications(params = {}) {
  const resp = await apiClient.get("/notifications/", { params });
  return resp.data;
}

export async function markNotificationRead(id) {
  const resp = await apiClient.post(`/notifications/${id}/read`);
  return resp.data;
}

export async function fetchUserOverview() {
  const resp = await apiClient.get("/users/me/overview");
  return resp.data;
}
