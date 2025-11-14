import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAuth } from '@/context/AuthContext';
import { NotificationItem, fetchNotifications, markNotificationRead } from '@/utils/api';

function formatTimestamp(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function NotificationsScreen() {
  const { authenticated, initializing } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState<number | null>(null);
  const lastNotifiedIds = useRef<Set<number>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchNotifications();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      load();
      intervalRef.current = setInterval(load, 45000);
    } else {
      setItems([]);
      lastNotifiedIds.current.clear();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [authenticated, load]);

  useEffect(() => {
    if (!authenticated || !items.length) return;
    items.forEach((item) => {
      if (item.status === 'unread' && !lastNotifiedIds.current.has(item.id)) {
        lastNotifiedIds.current.add(item.id);
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Verifier alert',
            body: item.message,
            data: item.incident_id ? { incidentId: String(item.incident_id) } : {},
          },
          trigger: null,
        }).catch((err) => console.warn('Notification schedule failed', err));
      }
    });
  }, [items, authenticated]);

  const handleMarkRead = async (id: number) => {
    setMarking(id);
    try {
      await markNotificationRead(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark as read.');
    } finally {
      setMarking(null);
    }
  };

  if (!authenticated) {
    return (
      <View style={styles.authGate}>
        <Text style={styles.authGateText}>
          Sign in from the Home tab to view live notifications.
        </Text>
        <Pressable style={styles.authGateButton} onPress={() => router.push('/(tabs)/index')}>
          <Text style={styles.authGateButtonLabel}>Go to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Verifier alerts</Text>
          <Pressable style={styles.refreshButton} onPress={load} disabled={loading || initializing}>
            <Text style={styles.refreshLabel}>{loading ? 'Loading…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && items.length === 0 ? (
          <Text style={styles.empty}>No notifications right now — you’re all caught up.</Text>
        ) : null}
        {loading && !items.length ? <ActivityIndicator style={{ marginTop: 16 }} color="#0f172a" /> : null}
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={[styles.notificationCard, item.status === 'unread' && styles.notificationUnread]}
            onPress={() => {
              if (item.incident_id) {
                router.push({ pathname: '/(tabs)/index', params: { incidentId: String(item.incident_id) } });
              }
            }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notificationMessage}>{item.message}</Text>
              <Text style={styles.notificationMeta}>
                {item.category} · {formatTimestamp(item.created_at)}
              </Text>
            </View>
            {item.status === 'unread' ? (
              <Pressable
                style={styles.markButton}
                disabled={marking === item.id}
                onPress={() => handleMarkRead(item.id)}>
                <Text style={styles.markButtonLabel}>{marking === item.id ? '...' : 'Mark read'}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: 'white',
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
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
  notificationCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  notificationUnread: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  notificationMessage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  notificationMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  markButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  markButtonLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  error: {
    color: '#b91c1c',
    fontSize: 12,
  },
  empty: {
    fontSize: 12,
    color: '#94a3b8',
  },
  authGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  authGateText: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
  },
  authGateButton: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  authGateButtonLabel: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
});
