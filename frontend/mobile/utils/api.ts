import Constants from 'expo-constants';

type RequestOptions = RequestInit & {
  headers?: Record<string, string>;
};

const envBase = process.env.EXPO_PUBLIC_API_BASE_URL;
const manifestBase =
  Constants.expoConfig?.extra?.apiBaseUrl ||
  (Constants.manifest2?.extra as Record<string, string> | undefined)?.apiBaseUrl;

const API_BASE = (envBase || manifestBase || 'http://127.0.0.1:8000').replace(/\/$/, '');

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let detail = 'Unknown error';
    try {
      const payload = await response.json();
      detail = payload?.detail || JSON.stringify(payload);
    } catch {
      detail = response.statusText || detail;
    }
    throw new ApiError(detail, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchStats() {
  return request<{
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    active_follow_up: number;
    prompt_completion_rate: number;
    sentiment_breakdown: Record<string, number>;
    avg_credibility: number;
  }>('/incidents/stats');
}

export type IncidentPreview = {
  id: number;
  category: string;
  description: string;
  location_text: string | null;
  status: string;
  incident_type: string;
  still_happening: boolean | null;
  created_at: string;
};

export function fetchIncidents(limit = 3) {
  return request<IncidentPreview[]>(`/incidents/?limit=${limit}`);
}

export function registerUser(payload: {
  email: string;
  password: string;
  display_name: string;
  role: string;
  role_justification?: string;
}) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload: {
  email: string;
  password: string;
  role: string;
  role_justification?: string;
}) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getApiBaseUrl() {
  return API_BASE;
}
