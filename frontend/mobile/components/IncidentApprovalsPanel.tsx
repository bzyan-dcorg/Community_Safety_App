import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchIncidents, updateIncidentStatus } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';

const STATUS_OPTIONS = [
  { id: 'community-confirmed', label: 'Community confirmed' },
  { id: 'official-confirmed', label: 'Official confirmed' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'unverified', label: 'Revert to unverified' },
];

const APPROVER_ROLES = new Set(['staff', 'officer']);

export function IncidentApprovalsPanel() {
  const { user } = useAuth();
  const canApprove = useMemo(() => (user?.role ? APPROVER_ROLES.has(user.role) : false), [user?.role]);

  const [incidents, setIncidents] = useState<Array<{ id: number; category: string; description: string; status: string }>>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadIncidents = useCallback(async () => {
    if (!canApprove) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchIncidents({ limit: 15, status_filter: 'unverified' });
      setIncidents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incidents.');
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

  const handleStatusUpdate = async (incidentId: number, status: string) => {
    setUpdatingId(incidentId);
    try {
      await updateIncidentStatus(incidentId, status);
      await loadIncidents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Incident approvals</Text>
          <Text style={styles.subtitle}>Promote unverified threads once you confirm details.</Text>
        </View>
        <Pressable style={styles.refreshButton} onPress={loadIncidents} disabled={loading}>
          <Text style={styles.refreshLabel}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && !incidents.length ? <ActivityIndicator color="#0f172a" style={{ marginVertical: 16 }} /> : null}
      {!loading && incidents.length === 0 ? <Text style={styles.empty}>No incidents awaiting review.</Text> : null}
      {incidents.map((incident) => (
        <View key={incident.id} style={styles.incidentCard}>
          <Text style={styles.incidentTitle}>
            #{incident.id} · {incident.category}
          </Text>
          <Text style={styles.incidentDescription} numberOfLines={3}>
            {incident.description}
          </Text>
          <Text style={styles.currentStatus}>Status: {incident.status}</Text>
          <View style={styles.actionsRow}>
            {STATUS_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.statusButton,
                  incident.status === option.id && styles.statusButtonActive,
                  updatingId === incident.id && styles.statusButtonDisabled,
                ]}
                disabled={updatingId === incident.id}
                onPress={() => handleStatusUpdate(incident.id, option.id)}>
                <Text
                  style={[
                    styles.statusButtonLabel,
                    incident.status === option.id && styles.statusButtonLabelActive,
                  ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'white',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#020617',
  },
  subtitle: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  refreshButton: {
    alignSelf: 'flex-start',
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
  incidentCard: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  incidentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  incidentDescription: {
    marginTop: 6,
    fontSize: 12,
    color: '#475569',
  },
  currentStatus: {
    marginTop: 6,
    fontSize: 11,
    color: '#94a3b8',
  },
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'white',
  },
  statusButtonActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#4338ca',
  },
  statusButtonDisabled: {
    opacity: 0.6,
  },
  statusButtonLabel: {
    fontSize: 11,
    color: '#475569',
  },
  statusButtonLabelActive: {
    color: '#1e1b4b',
    fontWeight: '600',
  },
});
