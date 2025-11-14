import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  fetchIncident,
  fetchIncidents,
  fetchRoleRequests,
  searchUsers,
  decideRoleRequest,
  setIncidentVisibility,
  setCommentVisibility,
  updateUserRewards,
  Incident,
} from '@/utils/api';
import { useAuth } from '@/context/AuthContext';

export function AdminManagementPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [roleRequests, setRoleRequests] = useState<Array<any>>([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestError, setRequestError] = useState('');

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentLoading, setIncidentLoading] = useState(false);
  const [incidentError, setIncidentError] = useState('');

  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<Array<any>>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [rewardDrafts, setRewardDrafts] = useState<Record<number, string>>({});

  const loadRoleRequests = useCallback(async () => {
    if (!isAdmin) return;
    setRequestLoading(true);
    setRequestError('');
    try {
      const data = await fetchRoleRequests({ status_filter: 'pending', limit: 20 });
      setRoleRequests(data);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Unable to load requests.');
    } finally {
      setRequestLoading(false);
    }
  }, [isAdmin]);

  const loadIncidents = useCallback(async () => {
    if (!isAdmin) return;
    setIncidentLoading(true);
    setIncidentError('');
    try {
      const list = await fetchIncidents({ limit: 6, include_hidden: true });
      const details = await Promise.all(list.map((item) => fetchIncident(item.id)));
      setIncidents(details);
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : 'Unable to load incidents.');
    } finally {
      setIncidentLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadRoleRequests();
      loadIncidents();
    }
  }, [isAdmin, loadRoleRequests, loadIncidents]);

  const handleDecision = async (id: number, action: 'approve' | 'deny') => {
    setRequestError('');
    try {
      await decideRoleRequest(id, { action });
      await loadRoleRequests();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Unable to approve request.');
    }
  };

  const handleIncidentVisibility = async (id: number, hidden: boolean) => {
    setIncidentError('');
    try {
      await setIncidentVisibility(id, hidden);
      await loadIncidents();
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : 'Unable to update incident.');
    }
  };

  const handleCommentVisibility = async (incidentId: number, commentId: number, hidden: boolean) => {
    setIncidentError('');
    try {
      await setCommentVisibility(incidentId, commentId, hidden);
      await loadIncidents();
    } catch (err) {
      setIncidentError(err instanceof Error ? err.message : 'Unable to update comment.');
    }
  };

  const handleUserSearch = async () => {
    if (!userQuery.trim()) {
      setUserResults([]);
      setRewardDrafts({});
      return;
    }
    setUserLoading(true);
    setUserError('');
    try {
      const data = await searchUsers({ query: userQuery.trim(), limit: 25 });
      setUserResults(data);
      const drafts: Record<number, string> = {};
      data.forEach((item) => {
        drafts[item.id] = String(item.reward_points ?? 0);
      });
      setRewardDrafts(drafts);
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Unable to search users.');
    } finally {
      setUserLoading(false);
    }
  };

  const handleRewardSave = async (userId: number) => {
    const draft = rewardDrafts[userId];
    if (draft == null) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setUserError('Reward points must be a non-negative number.');
      return;
    }
    try {
      await updateUserRewards(userId, parsed);
      await handleUserSearch();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Unable to update reward points.');
    }
  };

  const canModerate = useMemo(() => isAdmin, [isAdmin]);

  if (!isAdmin) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Role requests</Text>
          <Pressable style={styles.refreshButton} onPress={loadRoleRequests} disabled={requestLoading}>
            <Text style={styles.refreshLabel}>{requestLoading ? 'Loading…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {requestError ? <Text style={styles.error}>{requestError}</Text> : null}
        {roleRequests.length === 0 ? (
          <Text style={styles.empty}>No pending requests.</Text>
        ) : (
          roleRequests.map((req) => (
            <View key={req.id} style={styles.requestCard}>
              <Text style={styles.requestTitle}>{req.user?.display_name || req.user?.email}</Text>
              <Text style={styles.requestMeta}>
                Requested: {req.requested_role} · Current: {req.user?.role}
              </Text>
              {req.justification ? <Text style={styles.requestJustification}>{req.justification}</Text> : null}
              <View style={styles.actionsRow}>
                <Pressable style={[styles.smallButton, styles.approveButton]} onPress={() => handleDecision(req.id, 'approve')}>
                  <Text style={styles.approveLabel}>Approve</Text>
                </Pressable>
                <Pressable style={[styles.smallButton, styles.denyButton]} onPress={() => handleDecision(req.id, 'deny')}>
                  <Text style={styles.denyLabel}>Deny</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      {canModerate ? (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Incident visibility</Text>
            <Pressable style={styles.refreshButton} onPress={loadIncidents} disabled={incidentLoading}>
              <Text style={styles.refreshLabel}>{incidentLoading ? 'Loading…' : 'Refresh'}</Text>
            </Pressable>
          </View>
          {incidentError ? <Text style={styles.error}>{incidentError}</Text> : null}
          {incidents.length === 0 ? (
            <Text style={styles.empty}>No incidents loaded.</Text>
          ) : (
            incidents.map((incident) => (
              <View key={incident.id} style={styles.requestCard}>
                <Text style={styles.requestTitle}>
                  #{incident.id} · {incident.category}
                </Text>
                <Text style={styles.requestMeta}>Status: {incident.status}</Text>
                <Pressable
                  style={[styles.smallButton, incident.is_hidden ? styles.approveButton : styles.denyButton]}
                  onPress={() => handleIncidentVisibility(incident.id, !incident.is_hidden)}>
                  <Text style={incident.is_hidden ? styles.approveLabel : styles.denyLabel}>
                    {incident.is_hidden ? 'Unhide' : 'Hide'}
                  </Text>
                </Pressable>

                {incident.comments?.length ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={styles.commentHeader}>Recent comments</Text>
                    {incident.comments.slice(0, 3).map((comment) => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Text style={styles.commentText}>{comment.body}</Text>
                        <Pressable
                          style={[styles.microButton, comment.is_hidden && styles.microButtonActive]}
                          onPress={() => handleCommentVisibility(incident.id, comment.id, !comment.is_hidden)}>
                          <Text style={styles.microButtonLabel}>{comment.is_hidden ? 'Unhide' : 'Hide'}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))
          )}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reward controls</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={userQuery}
            onChangeText={setUserQuery}
            placeholder="Search by email or display name"
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          <Pressable style={styles.refreshButton} onPress={handleUserSearch} disabled={userLoading}>
            <Text style={styles.refreshLabel}>{userLoading ? 'Searching…' : 'Search'}</Text>
          </Pressable>
        </View>
        {userError ? <Text style={styles.error}>{userError}</Text> : null}
        {userResults.map((item) => (
          <View key={item.id} style={styles.requestCard}>
            <Text style={styles.requestTitle}>{item.display_name || item.email}</Text>
            <Text style={styles.requestMeta}>
              {item.email} · {item.role}
            </Text>
            <View style={styles.rewardRow}>
              <TextInput
                value={rewardDrafts[item.id] ?? String(item.reward_points ?? 0)}
                onChangeText={(value) => setRewardDrafts((prev) => ({ ...prev, [item.id]: value }))}
                keyboardType="number-pad"
                style={styles.rewardInput}
              />
              <Pressable style={[styles.smallButton, styles.approveButton]} onPress={() => handleRewardSave(item.id)}>
                <Text style={styles.approveLabel}>Save</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
    gap: 16,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'white',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#020617',
  },
  refreshButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  requestCard: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  requestTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  requestMeta: {
    fontSize: 12,
    color: '#475569',
    marginTop: 4,
  },
  requestJustification: {
    fontSize: 12,
    color: '#475569',
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  smallButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  approveButton: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  denyButton: {
    borderColor: '#f87171',
    backgroundColor: '#fef2f2',
  },
  approveLabel: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '600',
  },
  denyLabel: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    marginTop: 12,
    fontSize: 13,
    color: '#94a3b8',
  },
  error: {
    marginTop: 8,
    color: '#b91c1c',
    fontSize: 12,
  },
  commentHeader: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
    marginTop: 4,
  },
  commentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    marginRight: 8,
  },
  microButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  microButtonActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  microButtonLabel: {
    fontSize: 10,
    color: '#0f172a',
  },
  searchRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  rewardRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  rewardInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
});
