import axios from "axios";

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

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
  const resp = await axios.get(`${API_BASE}/incidents/`, {
    params: sanitizeParams(params),
  });
  return resp.data;
}

export async function fetchIncident(id) {
  const resp = await axios.get(`${API_BASE}/incidents/${id}`);
  return resp.data;
}

export async function createIncident(data) {
  const resp = await axios.post(`${API_BASE}/incidents/`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function updateIncident(id, data) {
  const resp = await axios.patch(`${API_BASE}/incidents/${id}`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function createFollowUp(id, data) {
  const resp = await axios.post(`${API_BASE}/incidents/${id}/follow-ups`, data, {
    headers: { "Content-Type": "application/json" },
  });
  return resp.data;
}

export async function fetchTaxonomy() {
  const resp = await axios.get(`${API_BASE}/taxonomy/`);
  return resp.data;
}

export async function fetchStats() {
  const resp = await axios.get(`${API_BASE}/incidents/stats`);
  return resp.data;
}
