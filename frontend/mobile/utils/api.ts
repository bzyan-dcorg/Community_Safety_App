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
let authToken: string | null = null;

export type UserProfile = {
  id: number;
  display_name: string | null;
  email: string;
  auth_provider: string;
  role: string;
  reward_points: number;
  membership_tier: string;
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: UserProfile;
};

export type Incident = IncidentPreview & {
  credibility_score: number;
  follow_up_due_at: string | null;
  updated_at: string | null;
  media: IncidentMedia[];
  follow_ups: Array<{
    id: number;
    status: string;
    notes: string | null;
    still_happening: boolean | null;
    contacted_authorities: string | null;
    feel_safe_now: boolean | null;
    safety_sentiment: string | null;
    created_at: string;
  }>;
  comments: Array<IncidentComment>;
  likes_count: number;
  unlikes_count: number;
  viewer_reaction: 'like' | 'unlike' | null;
  reporter: {
    id: number;
    display_name: string | null;
    email: string;
  } | null;
  reward_points_awarded: number;
  is_hidden?: boolean;
};

export type IncidentMedia = {
  id: number;
  media_type: 'image' | 'video';
  content_type: string | null;
  data_base64: string;
  filename: string | null;
  created_at: string;
};

export type IncidentComment = {
  id: number;
  body: string;
  created_at: string;
  user: {
    id: number;
    display_name: string | null;
    email: string;
  };
  attachments: Array<{
    id: number;
    media_type: string;
    content_type: string | null;
    data_base64: string | null;
    filename: string | null;
  }>;
  likes_count: number;
  unlikes_count: number;
  viewer_reaction: 'like' | 'unlike' | null;
  is_hidden?: boolean;
};

export type CommentMediaPayload = {
  media_type: 'image' | 'video';
  content_type?: string | null;
  data_base64: string;
  filename?: string | null;
};

export type TaxonomyResponse = {
  police_related: { label: string; items: string[] };
  community_civic: { label: string; items: string[] };
  public_order: { label: string; items: string[] };
};

export type NotificationItem = {
  id: number;
  message: string;
  status: 'unread' | 'read';
  category: string;
  incident_id: number | null;
  created_at: string;
};

export type UserOverview = {
  profile: UserProfile;
  rewards: {
    total_posts: number;
    confirmed_posts: number;
    total_likes: number;
    points: number;
    membership_tier: string;
    next_tier: string | null;
    points_to_next: number | null;
  };
  recent_posts: Array<{
    id: number;
    category: string;
    description: string;
    status: string;
    created_at: string;
    likes_count: number;
    reward_points_awarded: number;
  }>;
  unread_notifications: number;
  ledger: RewardLedgerEntry[];
};

export type RewardLedgerEntry = {
  id: number;
  delta: number;
  source: string;
  description: string;
  partner_id: string | null;
  partner_name: string | null;
  status: 'posted' | 'pending' | 'fulfilled' | 'cancelled';
  created_at: string;
};

export type RewardPartner = {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  fulfillment: string;
};

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
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
  lat: number | null;
  lng: number | null;
  status: string;
  incident_type: string;
  still_happening: boolean | null;
  created_at: string;
};

export function fetchIncidents(
  params: { limit?: number; incident_type?: string; status_filter?: string; include_hidden?: boolean } | number = 3,
) {
  if (typeof params === 'number') {
    return request<IncidentPreview[]>(`/incidents/?limit=${params}`);
  }
  const query = new URLSearchParams();
  if (typeof params.limit === 'number') query.append('limit', String(params.limit));
  if (params.incident_type) query.append('incident_type', params.incident_type);
  if (params.status_filter) query.append('status_filter', params.status_filter);
  if (params.include_hidden) query.append('include_hidden', 'true');
  return request<IncidentPreview[]>(`/incidents/?${query.toString()}`);
}

export function fetchTaxonomy() {
  return request<TaxonomyResponse>('/taxonomy/');
}

export function fetchIncident(id: number) {
  return request<Incident>(`/incidents/${id}`);
}

export function createIncident(payload: {
  category: string;
  description: string;
  location_text?: string;
  incident_type: string;
  still_happening?: boolean | null;
  contacted_authorities?: string | null;
  safety_sentiment?: string | null;
  lat?: number | null;
  lng?: number | null;
  media?: Array<{
    media_type: 'image' | 'video';
    content_type?: string | null;
    data_base64: string;
    filename?: string | null;
  }>;
}) {
  return request<Incident>('/incidents/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createComment(incidentId: number, payload: { body: string; media?: CommentMediaPayload[] }) {
  return request<IncidentComment>(`/incidents/${incidentId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setIncidentReaction(incidentId: number, action: 'like' | 'unlike' | 'clear') {
  return request<{ likes_count: number; unlikes_count: number; viewer_reaction: 'like' | 'unlike' | null }>(
    `/incidents/${incidentId}/reactions`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
  );
}

export function setCommentReaction(
  incidentId: number,
  commentId: number,
  action: 'like' | 'unlike' | 'clear',
) {
  return request<IncidentComment>(`/incidents/${incidentId}/comments/${commentId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
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

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function registerEmail(payload: {
  email: string;
  password: string;
  display_name: string;
  role: string;
  role_justification?: string;
}) {
  return request<TokenResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginEmail(payload: {
  email: string;
  password: string;
  role: string;
  role_justification?: string;
}) {
  return request<TokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchProfile() {
  return request<UserProfile>('/auth/me');
}

// Backwards compatibility with existing imports
export const registerUser = registerEmail;
export const loginUser = loginEmail;

export function fetchNotifications(params: { status?: 'unread' | 'read' } = {}) {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<NotificationItem[]>(`/notifications/${suffix}`);
}

export function markNotificationRead(id: number) {
  return request(`/notifications/${id}/read`, { method: 'POST' });
}

export function fetchUserOverview() {
  return request<UserOverview>('/users/me/overview');
}

export function fetchRewardPartners() {
  return request<RewardPartner[]>('/rewards/partners');
}

export function redeemReward(payload: { partner_id: string; quantity: number; notes?: string }) {
  return request('/rewards/redeem', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchRoleRequests(params: { status_filter?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.status_filter) query.append('status_filter', params.status_filter);
  if (typeof params.limit === 'number') query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<Array<{
    id: number;
    requested_role: string;
    status: string;
    justification: string | null;
    user: { id: number; display_name: string | null; email: string };
  }>>(`/role-requests/${suffix}`);
}

export function decideRoleRequest(id: number, payload: { action: 'approve' | 'deny'; role?: string }) {
  return request(`/role-requests/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setIncidentVisibility(incidentId: number, hidden: boolean) {
  return request(`/incidents/${incidentId}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ hidden }),
  });
}

export function setCommentVisibility(incidentId: number, commentId: number, hidden: boolean) {
  return request(`/incidents/${incidentId}/comments/${commentId}/visibility`, {
    method: 'PATCH',
    body: JSON.stringify({ hidden }),
  });
}

export function updateIncidentStatus(incidentId: number, status: string) {
  return request(`/incidents/${incidentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function searchUsers(params: { query?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params.query) query.append('query', params.query);
  if (typeof params.limit === 'number') query.append('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<UserProfile[]>(`/users/${suffix}`);
}

export function updateUserRewards(userId: number, rewardPoints: number) {
  return request(`/users/${userId}/rewards`, {
    method: 'PATCH',
    body: JSON.stringify({ reward_points: rewardPoints }),
  });
}
