import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiError,
  IncidentPreview,
  fetchIncidents,
  fetchStats,
  getApiBaseUrl,
  loginUser,
  registerUser,
} from '@/utils/api';

const MODES = [
  { id: 'login', label: 'Sign in' },
  { id: 'register', label: 'Create account' },
];

const ROLE_OPTIONS = [
  {
    id: 'resident',
    label: 'Resident',
    description: 'Share what you see and earn helpfulness points.',
  },
  {
    id: 'staff',
    label: 'City / agency staff',
    description: 'Coordinate 311 style tickets with teams.',
  },
  {
    id: 'reporter',
    label: 'Journalist',
    description: 'Follow verified neighborhood signals.',
  },
  {
    id: 'officer',
    label: 'Officer',
    description: 'Respond to urgent public safety items.',
  },
];

const DEFAULT_SNAPSHOT = [
  { label: 'Total signals', value: '—', detail: 'Waiting for data' },
  { label: 'Verified today', value: '—', detail: 'Connect to backend' },
  { label: 'Active follow-ups', value: '—', detail: 'Connect to backend' },
];

const apiBaseUrl = getApiBaseUrl();

const formatLabel = (value: string) =>
  value
    .split(/[-_]/)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');

const formatTime = (value: string) => {
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
};

export default function HomeScreen() {
  const [showAuthPreview, setShowAuthPreview] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [role, setRole] = useState('resident');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleJustification, setRoleJustification] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [stats, setStats] = useState<Awaited<ReturnType<typeof fetchStats>> | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

  const [incidents, setIncidents] = useState<IncidentPreview[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentsError, setIncidentsError] = useState('');

  const roleRequiresJustification = role !== 'resident';

  const resetAuthFields = () => {
    setMode('login');
    setRole('resident');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setRoleJustification('');
    setAuthError('');
  };

  const closeAuthPreview = () => {
    setShowAuthPreview(false);
    resetAuthFields();
  };

  const openAuthPreview = (selectedMode: 'login' | 'register') => {
    setMode(selectedMode);
    setShowAuthPreview(true);
  };

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const payload = await fetchStats();
      setStats(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load stats';
      setStatsError(message);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    setIncidentsError('');
    try {
      const payload = await fetchIncidents(5);
      setIncidents(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load incidents';
      setIncidentsError(message);
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadIncidents();
  }, [loadStats, loadIncidents]);

  const snapshotCards = useMemo(() => {
    if (!stats) {
      return DEFAULT_SNAPSHOT;
    }
    const official = stats.by_status?.['official-confirmed'] ?? 0;
    const communityConfirmed = stats.by_status?.['community-confirmed'] ?? 0;
    const unverified = stats.by_status?.unverified ?? 0;
    return [
      {
        label: 'Total signals',
        value: String(stats.total),
        detail: `${Math.round((stats.prompt_completion_rate || 0) * 100)}% prompts answered`,
      },
      {
        label: 'Verified today',
        value: String(official),
        detail: `${communityConfirmed} community confirmed`,
      },
      {
        label: 'Active follow-ups',
        value: String(stats.active_follow_up),
        detail: `${unverified} awaiting review`,
      },
    ];
  }, [stats]);

  const canSubmit = useMemo(() => {
    if (!email.trim() || password.trim().length < 8) {
      return false;
    }
    if (mode === 'register' && !displayName.trim()) {
      return false;
    }
    return true;
  }, [email, password, mode, displayName]);

  const handleAuthSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const justification = roleJustification.trim();

    setAuthLoading(true);
    setAuthError('');
    try {
      if (mode === 'login') {
        await loginUser({
          email: trimmedEmail,
          password: trimmedPassword,
          role,
          ...(justification ? { role_justification: justification } : {}),
        });
        Alert.alert('Signed in', 'Session issued by the FastAPI backend. Token handling is still in progress on mobile.');
      } else {
        await registerUser({
          email: trimmedEmail,
          password: trimmedPassword,
          display_name: displayName.trim(),
          role,
          ...(justification ? { role_justification: justification } : {}),
        });
        Alert.alert('Account created', 'You can now sign in on the web or mobile preview.');
      }
      closeAuthPreview();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to complete request.';
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const communityPreview = incidents.slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>COMMUNITY SAFETY</Text>
          <Text style={styles.heroTitle}>Signal incidents faster on mobile.</Text>
          <Text style={styles.heroSubtitle}>
            Blend resident reports, agency confirmations, and newsroom requests into one live feed your city can trust.
          </Text>
          <View style={styles.heroActions}>
            <Pressable style={styles.heroPrimaryCta} onPress={() => openAuthPreview('login')}>
              <Text style={styles.heroPrimaryCtaLabel}>Sign in</Text>
            </Pressable>
            <Pressable style={styles.heroGhostCta} onPress={() => openAuthPreview('register')}>
              <Text style={styles.heroGhostCtaLabel}>Create account</Text>
            </Pressable>
          </View>
          <View style={styles.heroMetaRow}>
            <View style={styles.heroMetaPill}>
              <Text style={styles.heroMetaText}>Live beta</Text>
            </View>
            <Text style={styles.heroMetaSecondary}>API: {apiBaseUrl}</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Live signal snapshot</Text>
              <Text style={styles.sectionSubtitle}>Pulled directly from FastAPI</Text>
            </View>
            <Pressable style={styles.linkButton} onPress={loadStats}>
              <Text style={styles.linkButtonLabel}>Refresh</Text>
            </Pressable>
          </View>
          {statsLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : statsError ? (
            <Text style={styles.errorLabel}>{statsError}</Text>
          ) : (
            <View style={styles.signalGrid}>
              {snapshotCards.map((card) => (
                <View key={card.label} style={styles.signalCard}>
                  <Text style={styles.signalValue}>{card.value}</Text>
                  <Text style={styles.signalLabel}>{card.label}</Text>
                  <Text style={styles.signalDetail}>{card.detail}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderText}>
              <Text style={styles.sectionTitle}>Community thread preview</Text>
              <Text style={styles.sectionSubtitle}>Tap to inspect incident details</Text>
            </View>
            <Pressable style={styles.linkButton} onPress={loadIncidents}>
              <Text style={styles.linkButtonLabel}>Reload</Text>
            </Pressable>
          </View>
          {incidentsLoading ? (
            <ActivityIndicator color="#0f172a" />
          ) : incidentsError ? (
            <Text style={styles.errorLabel}>{incidentsError}</Text>
          ) : communityPreview.length === 0 ? (
            <Text style={styles.errorLabel}>No incidents yet. Submit one from the web dashboard.</Text>
          ) : (
            communityPreview.map((item) => (
              <Pressable key={item.id} style={styles.communityItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.communityBadge}>{formatLabel(item.incident_type)}</Text>
                  <Text style={styles.communityTitle}>{item.category || 'General incident'}</Text>
                  <Text style={styles.communityStatus}>
                    {formatLabel(item.status)} · {item.still_happening ? 'Live now' : 'In follow-up'}
                  </Text>
                  {item.location_text ? (
                    <Text style={styles.communityLocation}>{item.location_text}</Text>
                  ) : null}
                </View>
                <Text style={styles.communityTime}>{formatTime(item.created_at)}</Text>
              </Pressable>
            ))
          )}
          <Pressable style={styles.secondaryButton} onPress={loadIncidents}>
            <Text style={styles.secondaryButtonLabel}>Refresh feed</Text>
          </Pressable>
        </View>
      </ScrollView>

      {showAuthPreview && (
        <View style={styles.authOverlay}>
          <Pressable style={styles.overlayBackdrop} onPress={closeAuthPreview}>
            <Text style={{ opacity: 0 }}>Close</Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.authSheet} showsVerticalScrollIndicator={false}>
            <View style={styles.authCard}>
              <Pressable style={styles.authCloseButton} onPress={closeAuthPreview}>
                <Text style={styles.authCloseLabel}>×</Text>
              </Pressable>

              <Text style={styles.authTitle}>{mode === 'login' ? 'Welcome back' : 'Join the neighborhood'}</Text>
              <Text style={styles.authSubtitle}>
                Mobile hooks into the same FastAPI auth endpoints as the web app so you can test the flow on devices.
              </Text>

              <View style={styles.modeSwitch}>
                {MODES.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => setMode(option.id as 'login' | 'register')}
                    style={[styles.modeButton, mode === option.id && styles.modeButtonActive]}
                  >
                    <Text style={[styles.modeButtonLabel, mode === option.id && styles.modeButtonLabelActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.rolesHeader}>
                <Text style={styles.rolesTitle}>I&apos;m signing in as</Text>
                <Text style={styles.rolesNote}>
                  Roles can be selected during registration or the first time you use social sign-in.
                </Text>
              </View>

              <View style={styles.rolesGrid}>
                {ROLE_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => setRole(option.id)}
                    style={[styles.roleCard, role === option.id && styles.roleCardActive]}
                  >
                    <Text style={[styles.roleLabel, role === option.id && styles.roleLabelActive]}>{option.label}</Text>
                    <Text style={styles.roleDescription}>{option.description}</Text>
                  </Pressable>
                ))}
              </View>

              {roleRequiresJustification && (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeTitle}>Staff, reporter, and officer roles need approval.</Text>
                  <Text style={styles.noticeBody}>
                    We start you as a resident and upgrade the role once reviewers confirm your request.
                  </Text>
                  <TextInput
                    value={roleJustification}
                    onChangeText={setRoleJustification}
                    style={styles.noticeInput}
                    placeholder="Tell reviewers why you need this role"
                    placeholderTextColor="#a16207"
                    multiline
                  />
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@email.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{mode === 'login' ? 'Password' : 'Create password'}</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry
                  style={styles.input}
                />
              </View>

              {mode === 'register' && (
                <View style={styles.field}>
                  <Text style={styles.label}>Display name</Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Neighborhood handle"
                    placeholderTextColor="#94a3b8"
                    style={styles.input}
                  />
                </View>
              )}

              {authError ? <Text style={styles.errorLabel}>{authError}</Text> : null}

              <Pressable
                style={[styles.primaryButton, mode === 'login' ? styles.primaryButtonLogin : styles.primaryButtonRegister]}
                onPress={handleAuthSubmit}
                disabled={!canSubmit || authLoading}
              >
                <Text style={styles.primaryButtonLabel}>
                  {authLoading ? 'Processing…' : mode === 'login' ? 'Sign in' : 'Create account'}
                </Text>
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => Alert.alert('Coming soon', 'Configure Expo native modules to launch Google OAuth from mobile.')}
              >
                <Text style={styles.secondaryButtonLabel}>Continue with Google</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => Alert.alert('Coming soon', 'Apple sign-in launches once credentials are configured.')}
              >
                <Text style={styles.secondaryButtonLabel}>Continue with Apple</Text>
              </Pressable>

              <Text style={styles.helperText}>
                This preview talks to {apiBaseUrl}. Run `python -m backend.scripts.seed_sample_data` for demo incidents.
              </Text>
            </View>
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 24,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 28,
    padding: 24,
  },
  heroEyebrow: {
    color: '#cbd5f5',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: 'white',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    marginTop: 12,
  },
  heroSubtitle: {
    color: '#d1d5db',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  heroPrimaryCta: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'white',
    paddingVertical: 14,
    alignItems: 'center',
  },
  heroPrimaryCtaLabel: {
    color: '#020617',
    fontWeight: '600',
    fontSize: 15,
  },
  heroGhostCta: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.4)',
    paddingVertical: 14,
    alignItems: 'center',
  },
  heroGhostCtaLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
  },
  heroMetaPill: {
    backgroundColor: 'rgba(248, 250, 252, 0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
  },
  heroMetaText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  heroMetaSecondary: {
    color: '#94a3b8',
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: 'white',
    borderRadius: 28,
    padding: 24,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#020617',
  },
  sectionSubtitle: {
    color: '#475569',
    fontSize: 13,
  },
  linkButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  linkButtonLabel: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '600',
  },
  signalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  signalCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 16,
  },
  signalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#020617',
  },
  signalLabel: {
    marginTop: 4,
    color: '#475569',
    fontSize: 13,
  },
  signalDetail: {
    marginTop: 6,
    color: '#0f172a',
    fontSize: 12,
  },
  communityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  communityBadge: {
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1,
    color: '#0f172a',
  },
  communityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#020617',
    marginTop: 2,
  },
  communityStatus: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4,
  },
  communityLocation: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  communityTime: {
    fontSize: 12,
    color: '#94a3b8',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButtonLabel: {
    color: '#0f172a',
    fontWeight: '600',
    fontSize: 14,
  },
  authOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.5)',
  },
  authSheet: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  authCard: {
    backgroundColor: 'white',
    borderRadius: 32,
    padding: 24,
    marginTop: 'auto',
  },
  authCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authCloseLabel: {
    fontSize: 20,
    color: '#475569',
    marginTop: -2,
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#020617',
    paddingRight: 32,
  },
  authSubtitle: {
    marginTop: 6,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    paddingRight: 32,
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    padding: 4,
    marginTop: 16,
  },
  modeButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  modeButtonLabel: {
    color: '#64748b',
    fontWeight: '600',
  },
  modeButtonLabelActive: {
    color: '#020617',
  },
  rolesHeader: {
    marginTop: 18,
    marginBottom: 12,
  },
  rolesTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
  rolesNote: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  rolesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roleCard: {
    flexBasis: '48%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: 'white',
    marginBottom: 12,
  },
  roleCardActive: {
    borderColor: '#020617',
    backgroundColor: '#f8fafc',
  },
  roleLabel: {
    fontWeight: '600',
    color: '#0f172a',
  },
  roleLabelActive: {
    color: '#020617',
  },
  roleDescription: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },
  noticeBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fef3c7',
    backgroundColor: '#fffbeb',
    padding: 14,
    marginTop: 4,
  },
  noticeTitle: {
    fontWeight: '600',
    color: '#854d0e',
  },
  noticeBody: {
    color: '#854d0e',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  noticeInput: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#78350f',
    fontSize: 13,
  },
  field: {
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#020617',
    backgroundColor: '#f8fafc',
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryButtonLogin: {
    backgroundColor: '#020617',
  },
  primaryButtonRegister: {
    backgroundColor: '#0f172a',
  },
  primaryButtonLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 18,
  },
  errorLabel: {
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
  },
});
