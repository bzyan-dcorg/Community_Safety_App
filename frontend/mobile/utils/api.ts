import Constants from 'expo-constants';

type RequestOptions = RequestInit & {
  headers?: Record<string, string>;
};

type ExpoExtra = {
  apiBaseUrl?: string;
  expoGo?: {
    hostUri?: string;
    debuggerHost?: string;
  };
};

const envBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const expoExtra = (Constants.expoConfig?.extra || {}) as ExpoExtra;
const manifest2Extra = (Constants.manifest2?.extra || {}) as ExpoExtra;
const manifestBase = expoExtra.apiBaseUrl || manifest2Extra.apiBaseUrl;

function resolveDeviceHost(): string | null {
  const legacyManifest = (Constants.manifest as { hostUri?: string; debuggerHost?: string } | null) || undefined;
  const candidateHost =
    expoExtra.expoGo?.hostUri ||
    expoExtra.expoGo?.debuggerHost ||
    manifest2Extra.expoGo?.hostUri ||
    manifest2Extra.expoGo?.debuggerHost ||
    Constants.expoConfig?.hostUri ||
    legacyManifest?.debuggerHost ||
    legacyManifest?.hostUri;

  if (!candidateHost) {
    return null;
  }

  const [host] = candidateHost.split(':');
  if (!host) {
    return null;
  }
  const port = process.env.EXPO_PUBLIC_API_PORT?.trim() || '8000';
  return `http://${host}:${port}`;
}

const inferredBase = resolveDeviceHost();
const DEFAULT_API_BASE = (envBase || manifestBase || inferredBase || 'http://127.0.0.1:8000').replace(/\/$/, '');

const normalizeBase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_API_BASE;
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
};

let API_BASE = DEFAULT_API_BASE;

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiError(
      `Unable to reach the Community Safety API at ${API_BASE}. ${reason}. ` +
        'If you are on a device, set EXPO_PUBLIC_API_BASE_URL to your computer IP.',
    );
  }

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

export function setApiBaseUrl(value: string) {
  API_BASE = normalizeBase(value);
  return API_BASE;
}

export function resetApiBaseUrl() {
  API_BASE = DEFAULT_API_BASE;
  return API_BASE;
}
