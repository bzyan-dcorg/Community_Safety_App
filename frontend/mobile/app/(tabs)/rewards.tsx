import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { RewardPartner, UserOverview, fetchRewardPartners, fetchUserOverview, redeemReward } from '@/utils/api';

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
  const router = useRouter();
  const [overview, setOverview] = useState<UserOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [partners, setPartners] = useState<RewardPartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnersError, setPartnersError] = useState('');
  const [selectedPartner, setSelectedPartner] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState('');
  const [redeemSuccess, setRedeemSuccess] = useState('');

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

  const loadPartners = useCallback(async () => {
    if (!authenticated) {
      setPartners([]);
      return;
    }
    setPartnersLoading(true);
    setPartnersError('');
    try {
      const data = await fetchRewardPartners();
      setPartners(data);
    } catch (err) {
      setPartnersError(err instanceof Error ? err.message : 'Unable to load partners.');
    } finally {
      setPartnersLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authenticated) {
      loadOverview();
      loadPartners();
    }
  }, [authenticated, loadOverview, loadPartners]);

  const handleRedeem = async () => {
    if (!selectedPartner) {
      setRedeemError('Select a partner first.');
      return;
    }
    setRedeeming(true);
    setRedeemError('');
    setRedeemSuccess('');
    try {
      await redeemReward({
        partner_id: selectedPartner,
        quantity: Number(quantity) || 1,
        notes: notes.trim() || undefined,
      });
      setRedeemSuccess('Request submitted! A teammate will confirm soon.');
      setSelectedPartner('');
      setQuantity('1');
      setNotes('');
      loadOverview();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Unable to redeem right now.');
    } finally {
      setRedeeming(false);
    }
  };

  if (!authenticated) {
    return (
      <View style={styles.authGate}>
        <Text style={styles.authGateText}>Sign in from the Home tab to view your rewards.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.dismissRow}>
        <Pressable style={styles.dismissButton} onPress={() => router.push('/(tabs)/index')} accessibilityRole="button">
          <Text style={styles.dismissLabel}>← Back to feed</Text>
        </Pressable>
      </View>
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

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Manual redemption</Text>
          <Text style={styles.subtitle}>Staff will approve perks before fulfillment.</Text>
        </View>
        {partnersLoading ? (
          <ActivityIndicator color="#0f172a" />
        ) : partnersError ? (
          <Text style={styles.error}>{partnersError}</Text>
        ) : partners.length === 0 ? (
          <Text style={styles.empty}>No partner perks yet — check back soon.</Text>
        ) : (
          <View style={styles.partnerGrid}>
            {partners.map((partner) => {
              const active = partner.id === selectedPartner;
              return (
                <Pressable
                  key={partner.id}
                  onPress={() => setSelectedPartner(partner.id)}
                  style={[styles.partnerCard, active && styles.partnerCardActive]}>
                  <Text style={styles.partnerName}>{partner.name}</Text>
                  <Text style={styles.partnerCost}>{partner.points_cost} pts</Text>
                  <Text style={styles.partnerDescription}>{partner.description}</Text>
                  <Text style={styles.partnerFootnote}>{partner.fulfillment}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ gap: 8 }}>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="number-pad"
            placeholder="Quantity"
            style={styles.input}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes to staff (optional)"
            style={[styles.input, { minHeight: 70 }]}
            multiline
          />
          {redeemError ? <Text style={styles.error}>{redeemError}</Text> : null}
          {redeemSuccess ? <Text style={styles.success}>{redeemSuccess}</Text> : null}
          <Pressable
            style={[styles.redeemButton, redeeming && { opacity: 0.6 }]}
            onPress={handleRedeem}
            disabled={redeeming}>
            <Text style={styles.redeemLabel}>{redeeming ? 'Submitting…' : 'Redeem manually'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Ledger history</Text>
          <Text style={styles.subtitle}>Latest reward changes</Text>
        </View>
        {overview?.ledger.length ? (
          overview.ledger.map((entry) => (
            <View key={entry.id} style={styles.ledgerCard}>
              <View style={styles.ledgerHeader}>
                <Text style={styles.ledgerDescription}>{entry.description}</Text>
                <Text
                  style={[
                    styles.ledgerDelta,
                    entry.delta >= 0 ? styles.ledgerPositive : styles.ledgerNegative,
                  ]}>
                  {entry.delta >= 0 ? '+' : ''}
                  {entry.delta} pts
                </Text>
              </View>
              <Text style={styles.ledgerMeta}>
                {entry.status} · {formatTimestamp(entry.created_at)}
              </Text>
              {entry.partner_name ? <Text style={styles.ledgerPartner}>{entry.partner_name}</Text> : null}
            </View>
          ))
        ) : (
          <Text style={styles.empty}>Activity will appear here once you start reporting or redeeming.</Text>
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
  dismissRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dismissButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  dismissLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
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
  partnerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  partnerCard: {
    flexBasis: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  partnerCardActive: {
    borderColor: '#0f172a',
    backgroundColor: '#eef2ff',
  },
  partnerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  partnerCost: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
  },
  partnerDescription: {
    fontSize: 12,
    color: '#475569',
  },
  partnerFootnote: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  redeemButton: {
    borderRadius: 24,
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    alignItems: 'center',
  },
  redeemLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  success: {
    fontSize: 12,
    color: '#15803d',
  },
  ledgerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  ledgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ledgerDescription: {
    flex: 1,
    marginRight: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  ledgerDelta: {
    fontSize: 14,
    fontWeight: '700',
  },
  ledgerPositive: {
    color: '#15803d',
  },
  ledgerNegative: {
    color: '#b91c1c',
  },
  ledgerMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  ledgerPartner: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
});
