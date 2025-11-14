import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { UserOverview, fetchUserOverview } from '@/utils/api';

function formatTimestamp(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function RewardsScreen() {
  const { authenticated, initializing } = useAuth();
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (!authenticated) {
      setOverview(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchUserOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load overview.');
    } finally {
      setLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadOverview();
    }
  }, [authenticated, loadOverview]);

  if (!authenticated) {
    return (
      <View style={styles.authGate}>
        <Text style={styles.authGateText}>Sign in from the Home tab to view your rewards.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Your neighborhood reputation</Text>
          <Text style={styles.subtitle}>Track signals you share and rewards you unlock.</Text>
        </View>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryEyebrow}>Membership tier</Text>
            <Text style={styles.summaryTier}>
              {overview?.profile.membership_tier || 'Neighbor'} · {overview?.rewards.points ?? 0} pts
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.notifications}>
              {overview?.unread_notifications ? `${overview?.unread_notifications} alerts waiting` : 'All caught up'}
            </Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <StatCard label="Signals shared" value={overview?.rewards.total_posts ?? 0} />
          <StatCard label="Confirmed useful" value={overview?.rewards.confirmed_posts ?? 0} />
          <StatCard label="Total likes" value={overview?.rewards.total_likes ?? 0} />
          <StatCard label="Reward points" value={overview?.rewards.points ?? 0} />
        </View>
        {loading ? <ActivityIndicator color="#0f172a" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Recent posts</Text>
          <Text style={styles.subtitle}>
            Showing {overview?.recent_posts.length ?? 0} of your latest updates
          </Text>
        </View>
        {overview?.recent_posts.length ? (
          overview.recent_posts.map((post) => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <Text style={styles.postCategory}>{post.category}</Text>
                <Text style={styles.postTimestamp}>{formatTimestamp(post.created_at)}</Text>
              </View>
              <Text style={styles.postDescription}>{post.description}</Text>
              <View style={styles.postMetaRow}>
                <Text style={styles.postMeta}>Status: {post.status}</Text>
                <Text style={styles.postMeta}>👍 {post.likes_count}</Text>
                <Text style={styles.postMeta}>Rewarded {post.reward_points_awarded} pts</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No reports yet — share what you see to earn rewards.</Text>
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#020617',
  },
  subtitle: {
    fontSize: 12,
    color: '#475569',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  summaryEyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#94a3b8',
  },
  summaryTier: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
  },
  notifications: {
    fontSize: 12,
    color: '#94a3b8',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  statCard: {
    flexBasis: '47%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  postCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  postCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  postTimestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  postDescription: {
    marginTop: 6,
    fontSize: 13,
    color: '#475569',
  },
  postMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  postMeta: {
    fontSize: 11,
    color: '#94a3b8',
  },
  empty: {
    fontSize: 12,
    color: '#94a3b8',
  },
  error: {
    fontSize: 12,
    color: '#b91c1c',
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
});
