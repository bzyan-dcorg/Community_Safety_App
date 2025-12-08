import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

import {
  Incident,
  IncidentComment,
  createComment,
  createFollowUp,
  fetchIncident,
  setCommentReaction,
  setIncidentReaction,
  setIncidentVisibility,
  setCommentVisibility,
  updateIncidentStatus,
} from '@/utils/api';
import { launchImageLibraryCompat } from '@/utils/imagePicker';
import { useAuth } from '@/context/AuthContext';

type IncidentDetailSheetProps = {
  incidentId: number | null;
  visible: boolean;
  onClose: () => void;
  onMutated?: () => void;
  onRequireAuth?: () => void;
};

const MODERATOR_ROLES = new Set(['admin', 'officer']);
const APPROVER_ROLES = new Set(['staff', 'officer', 'admin']);
const STATUS_OPTIONS = [
  { id: 'unverified', label: 'Unverified' },
  { id: 'community-confirmed', label: 'Community confirmed' },
  { id: 'official-confirmed', label: 'Official confirmed' },
  { id: 'resolved', label: 'Resolved' },
];
const COMMENT_MEDIA_LIMIT = 3;
const DEFAULT_ZOOM_DELTA = 0.01;
const CONTACT_OPTIONS = [
  { id: 'unknown', label: 'Not shared' },
  { id: 'none', label: 'No' },
  { id: 'service-request', label: 'Service request' },
  { id: '911', label: '911' },
  { id: 'not-needed', label: 'Not needed' },
];
const SENTIMENT_OPTIONS = [
  { id: 'safe', label: 'Safe' },
  { id: 'uneasy', label: 'Uneasy' },
  { id: 'unsafe', label: 'Unsafe' },
  { id: 'unsure', label: 'Unsure' },
];
const PROMPT_CHOICES: Array<{ id: boolean | null; label: string }> = [
  { id: true, label: 'Yes' },
  { id: false, label: 'No' },
  { id: null, label: 'Unsure' },
];

type CommentMediaDraft = {
  id: string;
  uri: string;
  media_type: 'image' | 'video';
  content_type: string;
  data_base64: string;
  filename?: string | null;
};

export function IncidentDetailSheet({ incidentId, visible, onClose, onMutated, onRequireAuth }: IncidentDetailSheetProps) {
  const { authenticated, user } = useAuth();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentVisibilityUpdating, setCommentVisibilityUpdating] = useState<number | null>(null);
  const [incidentVisibilityLoading, setIncidentVisibilityLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [commentMedia, setCommentMedia] = useState<CommentMediaDraft[]>([]);
  const [commentMediaError, setCommentMediaError] = useState('');
  const [followStatus, setFollowStatus] = useState('unverified');
  const [followStillHappening, setFollowStillHappening] = useState<boolean | null>(null);
  const [followFeelSafe, setFollowFeelSafe] = useState<boolean | null>(null);
  const [followContacted, setFollowContacted] = useState('unknown');
  const [followSentiment, setFollowSentiment] = useState('unsure');
  const [followAlias, setFollowAlias] = useState('');
  const [followNotes, setFollowNotes] = useState('');
  const [followComposerOpen, setFollowComposerOpen] = useState(false);
  const [followSubmitting, setFollowSubmitting] = useState(false);
  const [followError, setFollowError] = useState('');

  const derivedAlias = useMemo(() => {
    if (user?.display_name) return user.display_name;
    if (user?.email) return user.email.split('@')[0];
    return 'Community member';
  }, [user?.display_name, user?.email]);

  const canModerate = useMemo(() => (user?.role ? MODERATOR_ROLES.has(user.role) : false), [user?.role]);
  const canApprove = useMemo(() => (user?.role ? APPROVER_ROLES.has(user.role) : false), [user?.role]);
  const mapRegion = useMemo<Region | null>(() => {
    if (typeof incident?.lat !== 'number' || typeof incident?.lng !== 'number') {
      return null;
    }
    return {
      latitude: incident.lat,
      longitude: incident.lng,
      latitudeDelta: DEFAULT_ZOOM_DELTA,
      longitudeDelta: DEFAULT_ZOOM_DELTA,
    };
  }, [incident?.lat, incident?.lng]);
  const attachments = incident?.media ?? [];

  const loadIncident = useCallback(async () => {
    if (!incidentId) {
      setIncident(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchIncident(incidentId);
      setIncident(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load incident.');
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (visible) {
      loadIncident();
    }
  }, [visible, loadIncident]);

  useEffect(() => {
    if (!visible) {
      setMapExpanded(false);
      setCommentMedia([]);
      setCommentMediaError('');
    }
  }, [visible]);

  useEffect(() => {
    if (!mapRegion) {
      setMapExpanded(false);
    }
  }, [mapRegion]);

  useEffect(() => {
    setFollowComposerOpen(false);
    setFollowNotes('');
    setFollowError('');
  }, [incidentId]);

  useEffect(() => {
    if (!incident) {
      return;
    }
    setFollowStatus(incident.status || 'unverified');
    setFollowStillHappening(incident.still_happening);
    setFollowFeelSafe(incident.feel_safe_now);
    setFollowContacted(incident.contacted_authorities || 'unknown');
    setFollowSentiment(incident.safety_sentiment || 'unsure');
  }, [incident]);

  useEffect(() => {
    if (!followComposerOpen) {
      setFollowAlias(derivedAlias);
    }
  }, [derivedAlias, followComposerOpen]);

  useEffect(() => {
    if (!authenticated) {
      setFollowComposerOpen(false);
    }
  }, [authenticated]);

  const formatTimestamp = useCallback((value?: string | null) => {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }, []);

  const handleReaction = async (action: 'like' | 'unlike' | 'clear') => {
    if (!incident || !incidentId) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      const status = await setIncidentReaction(incidentId, action);
      setIncident({ ...incident, likes_count: status.likes_count, unlikes_count: status.unlikes_count, viewer_reaction: status.viewer_reaction });
      onMutated?.();
    } catch (err) {
      console.warn('Unable to react', err);
    }
  };

  const handleCommentReaction = async (commentId: number, action: 'like' | 'unlike' | 'clear') => {
    if (!incident || !incidentId) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    try {
      const updated = await setCommentReaction(incidentId, commentId, action);
      setIncident({
        ...incident,
        comments: incident.comments.map((comment) => (comment.id === updated.id ? updated : comment)),
      });
    } catch (err) {
      console.warn('Comment reaction failed', err);
    }
  };

  const handleAddCommentMedia = async () => {
    if (commentMedia.length >= COMMENT_MEDIA_LIMIT) {
      setCommentMediaError('You can attach up to three files.');
      return;
    }
    const result = await launchImageLibraryCompat({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) {
      return;
    }
    const asset = result.assets[0];
    let base64Payload = asset.base64 || null;
    if (!base64Payload && asset.uri) {
      try {
        base64Payload = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      } catch (readError) {
        console.warn('Unable to read attachment', readError);
      }
    }
    if (!base64Payload) {
      setCommentMediaError('Unable to attach that file.');
      return;
    }
    setCommentMediaError('');
    setCommentMedia((prev) => [
      ...prev,
      {
        id: `${asset.assetId || asset.uri || 'comment-media'}-${Date.now()}`,
        uri: asset.uri,
        media_type: asset.type === 'video' ? 'video' : 'image',
        content_type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        data_base64: base64Payload,
        filename: asset.fileName,
      },
    ]);
  };

  const handleRemoveCommentMedia = (id: string) => {
    setCommentMedia((prev) => prev.filter((media) => media.id !== id));
  };

  const handleOpenAttachment = async (media: {
    data_base64?: string | null;
    media_type?: string;
    content_type?: string | null;
    filename?: string | null;
  }) => {
    if (!media?.data_base64) {
      return;
    }
    try {
      const mimeType =
        media.content_type ||
        (media.media_type === 'video'
          ? 'video/mp4'
          : 'image/jpeg');
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) {
        await Linking.openURL(`data:${mimeType};base64,${media.data_base64}`);
        return;
      }
      const extension =
        mimeType?.includes('png')
          ? '.png'
          : mimeType?.includes('webp')
            ? '.webp'
            : mimeType?.includes('gif')
              ? '.gif'
              : mimeType?.includes('mov')
                ? '.mov'
                : mimeType?.includes('mp4')
                  ? '.mp4'
                  : media.media_type === 'video'
                    ? '.mp4'
                    : '.jpg';
      const sanitizedName = media.filename ? media.filename.replace(/[^a-z0-9.-]/gi, '') : '';
      const trimmedName = sanitizedName ? sanitizedName.slice(-40) : '';
      const safeName = trimmedName || `attachment-${Date.now()}${extension}`;
      const fileUri = `${baseDir}${safeName.endsWith(extension) ? safeName : `${safeName}${extension}`}`;
      await FileSystem.writeAsStringAsync(fileUri, media.data_base64, { encoding: FileSystem.EncodingType.Base64 });
      await Linking.openURL(fileUri);
    } catch (err) {
      console.warn('Unable to open attachment', err);
    }
  };

  const handleCommentSubmit = async () => {
    if (!incident || !incidentId || !commentBody.trim()) {
      return;
    }
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setCommentLoading(true);
    try {
      const newComment = await createComment(incidentId, {
        body: commentBody.trim(),
        media: commentMedia.map((media) => ({
          media_type: media.media_type,
          content_type: media.content_type,
          data_base64: media.data_base64,
          filename: media.filename,
        })),
      });
      setIncident({ ...incident, comments: [newComment, ...(incident.comments || [])] });
      setCommentBody('');
      setCommentMedia([]);
      setCommentMediaError('');
      onMutated?.();
    } catch (err) {
      console.warn('Unable to add comment', err);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleIncidentVisibility = async () => {
    if (!incident || !incidentId) return;
    if (!authenticated || !canModerate) {
      onRequireAuth?.();
      return;
    }
    setIncidentVisibilityLoading(true);
    try {
      await setIncidentVisibility(incidentId, !incident.is_hidden);
      const refreshed = await fetchIncident(incidentId);
      setIncident(refreshed);
      onMutated?.();
    } catch (err) {
      console.warn('Unable to update visibility', err);
    } finally {
      setIncidentVisibilityLoading(false);
    }
  };

  const handleCommentVisibilityToggle = async (commentId: number, hidden: boolean) => {
    if (!incident || !incidentId) return;
    if (!authenticated || !canModerate) {
      onRequireAuth?.();
      return;
    }
    setCommentVisibilityUpdating(commentId);
    try {
      await setCommentVisibility(incidentId, commentId, hidden);
      const refreshed = await fetchIncident(incidentId);
      setIncident(refreshed);
      onMutated?.();
    } catch (err) {
      console.warn('Unable to update comment visibility', err);
    } finally {
      setCommentVisibilityUpdating(null);
    }
  };

  const handleStatusChange = async (nextStatus: string) => {
    if (!incident || !incidentId || incident.status === nextStatus) return;
    if (!authenticated || !canApprove) {
      onRequireAuth?.();
      return;
    }
    setStatusUpdating(true);
    try {
      await updateIncidentStatus(incidentId, nextStatus);
      const refreshed = await fetchIncident(incidentId);
      setIncident(refreshed);
      onMutated?.();
    } catch (err) {
      console.warn('Unable to update status', err);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleFollowComposerToggle = () => {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setFollowError('');
    setFollowComposerOpen((prev) => !prev);
  };

  const handleFollowUpSubmit = async () => {
    if (!incident || !incidentId) return;
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    setFollowSubmitting(true);
    setFollowError('');
    try {
      const payload: {
        status?: string;
        notes?: string;
        still_happening?: boolean | null;
        contacted_authorities?: string | null;
        feel_safe_now?: boolean | null;
        safety_sentiment?: string | null;
        created_by?: string;
      } = {
        notes: followNotes.trim() || undefined,
        still_happening: followStillHappening,
        contacted_authorities: followContacted,
        feel_safe_now: followFeelSafe,
        safety_sentiment: followSentiment,
        created_by: followAlias.trim() || undefined,
      };
      if (canApprove) {
        payload.status = followStatus;
      }
      await createFollowUp(incidentId, payload);
      setFollowNotes('');
      setFollowComposerOpen(false);
      const refreshed = await fetchIncident(incidentId);
      setIncident(refreshed);
      onMutated?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to record follow-up.';
      setFollowError(message);
    } finally {
      setFollowSubmitting(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Text style={{ opacity: 0 }}>Close</Text>
      </Pressable>
      <View style={styles.sheet}>
        {loading ? (
          <ActivityIndicator color="#0f172a" />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : incident ? (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>#{incident.id}</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeLabel}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.incidentCategory}>{incident.category}</Text>
            <Text style={styles.incidentDescription}>{incident.description}</Text>
            {incident.location_text ? <Text style={styles.incidentLocation}>{incident.location_text}</Text> : null}
            {(mapRegion || attachments.length) ? (
              <View style={styles.mapCard}>
                {mapRegion ? (
                  <>
                    <View style={styles.mapLinkRow}>
                      <Text style={styles.mapLinkLabel}>Map preview</Text>
                      <Text style={styles.mapLinkValue}>
                        {typeof incident.lat === 'number' ? incident.lat.toFixed(4) : '—'} ,{' '}
                        {typeof incident.lng === 'number' ? incident.lng.toFixed(4) : '—'}
                      </Text>
                    </View>
                    <Pressable style={styles.mapPreviewShell} onPress={() => setMapExpanded(true)}>
                      <MapView
                        pointerEvents="none"
                        style={styles.mapPreview}
                        region={mapRegion}
                        scrollEnabled={false}
                        zoomEnabled={false}
                        rotateEnabled={false}
                        pitchEnabled={false}>
                        <Marker coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }} />
                      </MapView>
                      <View style={styles.mapPreviewHint}>
                        <Text style={styles.mapPreviewHintLabel}>Tap to expand</Text>
                      </View>
                    </Pressable>
                  </>
                ) : null}
                {attachments.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentRow}>
                    {attachments.map((media) => (
                      media.media_type === 'image' ? (
                        <Pressable key={media.id} onPress={() => handleOpenAttachment(media)}>
                          <Image
                            source={{ uri: `data:${media.content_type || 'image/jpeg'};base64,${media.data_base64}` }}
                            style={styles.attachmentImage}
                          />
                        </Pressable>
                      ) : (
                        <Pressable key={media.id} style={styles.attachmentVideo} onPress={() => handleOpenAttachment(media)}>
                          <Text style={styles.attachmentVideoLabel}>Play clip</Text>
                        </Pressable>
                      )
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.metaText}>Status: {incident.status}</Text>
            {incident.is_hidden ? <Text style={styles.hiddenBadge}>Hidden from feed</Text> : null}
            <Text style={styles.metaText}>Credibility: {Math.round((incident.credibility_score || 0) * 100)}%</Text>
            <Text style={styles.metaText}>Reported: {formatTimestamp(incident.created_at)}</Text>
            {canModerate ? (
              <Pressable style={styles.moderatorButton} onPress={handleIncidentVisibility} disabled={incidentVisibilityLoading}>
                <Text style={styles.moderatorButtonLabel}>
                  {incident.is_hidden ? (incidentVisibilityLoading ? 'Restoring…' : 'Unhide incident') : incidentVisibilityLoading ? 'Hiding…' : 'Hide incident'}
                </Text>
              </Pressable>
            ) : null}
            {canApprove ? (
              <View style={styles.statusChipRow}>
                {STATUS_OPTIONS.map((option) => (
                  <Pressable
                    key={option.id}
                    style={[styles.statusChip, incident.status === option.id && styles.statusChipActive]}
                    onPress={() => handleStatusChange(option.id)}
                    disabled={statusUpdating}>
                    <Text style={[styles.statusChipLabel, incident.status === option.id && styles.statusChipLabelActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.reactionRow}>
              <Pressable
                style={[styles.reactionButton, incident.viewer_reaction === 'like' && styles.reactionButtonActive]}
                onPress={() => handleReaction(incident.viewer_reaction === 'like' ? 'clear' : 'like')}>
                <Text style={styles.reactionLabel}>👍 {incident.likes_count}</Text>
              </Pressable>
              <Pressable
                style={[styles.reactionButton, incident.viewer_reaction === 'unlike' && styles.reactionButtonActive]}
                onPress={() => handleReaction(incident.viewer_reaction === 'unlike' ? 'clear' : 'unlike')}>
                <Text style={styles.reactionLabel}>👎 {incident.unlikes_count}</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <View style={styles.followHeaderRow}>
                <Text style={styles.sectionTitle}>Follow-ups</Text>
                {incident.follow_up_due_at ? (
                  <Text style={styles.followDueLabel}>Next check-in {formatTimestamp(incident.follow_up_due_at)}</Text>
                ) : null}
              </View>
              {incident.follow_ups.length === 0 ? (
                <Text style={styles.metaText}>No follow-ups yet. Share what changed.</Text>
              ) : (
                incident.follow_ups.map((entry) => {
                  const promptChips: JSX.Element[] = [];
                  if (typeof entry.still_happening === 'boolean') {
                    promptChips.push(
                      <Text key="ongoing" style={styles.followPromptChip}>
                        Ongoing: {entry.still_happening ? 'Yes' : 'No'}
                      </Text>,
                    );
                  }
                  if (typeof entry.feel_safe_now === 'boolean') {
                    promptChips.push(
                      <Text key="feel" style={styles.followPromptChip}>
                        Feels safe: {entry.feel_safe_now ? 'Yes' : 'No'}
                      </Text>,
                    );
                  }
                  if (entry.contacted_authorities) {
                    promptChips.push(
                      <Text key="contact" style={styles.followPromptChip}>
                        Authorities: {entry.contacted_authorities.replace(/-/g, ' ')}
                      </Text>,
                    );
                  }
                  if (entry.safety_sentiment) {
                    promptChips.push(
                      <Text key="sentiment" style={styles.followPromptChip}>
                        Sentiment: {entry.safety_sentiment.replace(/-/g, ' ')}
                      </Text>,
                    );
                  }
                  return (
                    <View key={entry.id} style={styles.followCard}>
                      <View style={styles.followCardHeader}>
                        <Text style={styles.followCardTitle}>{entry.created_by || 'Community follow-up'}</Text>
                        <Text style={styles.followCardTimestamp}>{formatTimestamp(entry.created_at)}</Text>
                      </View>
                      <Text style={styles.followCardStatus}>{entry.status.replace(/-/g, ' ')}</Text>
                      {entry.notes ? <Text style={styles.followCardNotes}>{entry.notes}</Text> : null}
                      {promptChips.length ? <View style={styles.followPromptRow}>{promptChips}</View> : null}
                    </View>
                  );
                })
              )}
              {followComposerOpen ? (
                <>
                  <View style={styles.followComposer}>
                    {canApprove ? (
                      <>
                        <Text style={styles.followControlLabel}>Status</Text>
                        <View style={styles.followChipRow}>
                          {STATUS_OPTIONS.map((option) => (
                            <Pressable
                              key={option.id}
                              style={[styles.followChip, followStatus === option.id && styles.followChipActive]}
                              onPress={() => setFollowStatus(option.id)}>
                              <Text
                                style={[
                                  styles.followChipLabel,
                                  followStatus === option.id && styles.followChipLabelActive,
                                ]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    ) : null}
                    <Text style={styles.followControlLabel}>Is it still happening?</Text>
                    <View style={styles.followChipRow}>
                      {PROMPT_CHOICES.map((option) => (
                        <Pressable
                          key={`ongoing-${option.id}`}
                          style={[styles.followChip, followStillHappening === option.id && styles.followChipActive]}
                          onPress={() => setFollowStillHappening(option.id)}>
                          <Text
                            style={[
                              styles.followChipLabel,
                              followStillHappening === option.id && styles.followChipLabelActive,
                            ]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.followControlLabel}>Do people feel safe now?</Text>
                    <View style={styles.followChipRow}>
                      {PROMPT_CHOICES.map((option) => (
                        <Pressable
                          key={`safe-${option.id}`}
                          style={[styles.followChip, followFeelSafe === option.id && styles.followChipActive]}
                          onPress={() => setFollowFeelSafe(option.id)}>
                          <Text
                            style={[
                              styles.followChipLabel,
                              followFeelSafe === option.id && styles.followChipLabelActive,
                            ]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.followControlLabel}>Authorities contacted</Text>
                    <View style={styles.followChipRow}>
                      {CONTACT_OPTIONS.map((option) => (
                        <Pressable
                          key={option.id}
                          style={[styles.followChip, followContacted === option.id && styles.followChipActive]}
                          onPress={() => setFollowContacted(option.id)}>
                          <Text
                            style={[
                              styles.followChipLabel,
                              followContacted === option.id && styles.followChipLabelActive,
                            ]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.followControlLabel}>Sentiment</Text>
                    <View style={styles.followChipRow}>
                      {SENTIMENT_OPTIONS.map((option) => (
                        <Pressable
                          key={option.id}
                          style={[styles.followChip, followSentiment === option.id && styles.followChipActive]}
                          onPress={() => setFollowSentiment(option.id)}>
                          <Text
                            style={[
                              styles.followChipLabel,
                              followSentiment === option.id && styles.followChipLabelActive,
                            ]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.followControlLabel}>Notes</Text>
                    <TextInput
                      multiline
                      value={followNotes}
                      onChangeText={setFollowNotes}
                      placeholder="Share what changed or what you observed…"
                      placeholderTextColor="#94a3b8"
                      style={styles.followTextarea}
                    />
                    <Text style={styles.followControlLabel}>Update by</Text>
                    <TextInput
                      value={followAlias}
                      onChangeText={setFollowAlias}
                      placeholder="Community member"
                      placeholderTextColor="#94a3b8"
                      style={styles.followInput}
                    />
                    <Pressable
                      style={[styles.followSubmit, followSubmitting && styles.followSubmitDisabled]}
                      onPress={handleFollowUpSubmit}
                      disabled={followSubmitting}>
                      <Text style={styles.followSubmitLabel}>{followSubmitting ? 'Saving…' : 'Save follow-up'}</Text>
                    </Pressable>
                  </View>
                  <Pressable style={styles.followButtonMuted} onPress={handleFollowComposerToggle}>
                    <Text style={styles.followButtonMutedLabel}>Cancel</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable style={styles.followButton} onPress={handleFollowComposerToggle}>
                  <Text style={styles.followButtonLabel}>
                    {authenticated ? 'Add follow-up' : 'Sign in to add follow-up'}
                  </Text>
                </Pressable>
              )}
              {followError ? <Text style={styles.errorLabel}>{followError}</Text> : null}
              <Text style={styles.followHint}>
                Neighbors can post follow-ups to keep the incident current. Staff and officers still verify and resolve
                threads.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Comments</Text>
              {incident.comments.length === 0 ? (
                <Text style={styles.metaText}>No comments yet.</Text>
              ) : (
                incident.comments.map((comment) => (
                  <View key={comment.id} style={[styles.commentCard, comment.is_hidden && styles.commentCardHidden]}>
                    <Text style={styles.commentAuthor}>{comment.user?.display_name || comment.user?.email}</Text>
                    {comment.is_hidden ? <Text style={styles.commentHiddenBadge}>Hidden</Text> : null}
                    <Text style={styles.commentBody}>{comment.body}</Text>
                    {comment.attachments?.length ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.commentAttachmentPreviewRow}>
                        {comment.attachments.map((attachment) =>
                          attachment.media_type === 'image' && attachment.data_base64 ? (
                            <Pressable key={attachment.id} onPress={() => handleOpenAttachment(attachment)}>
                              <Image
                                source={{
                                  uri: `data:${attachment.content_type || 'image/jpeg'};base64,${attachment.data_base64}`,
                                }}
                                style={styles.attachmentImage}
                              />
                            </Pressable>
                          ) : (
                            <Pressable
                              key={attachment.id}
                              style={styles.attachmentVideo}
                              onPress={() => handleOpenAttachment(attachment)}>
                              <Text style={styles.attachmentVideoLabel}>Play clip</Text>
                            </Pressable>
                          ),
                        )}
                      </ScrollView>
                    ) : null}
                    <View style={styles.commentFooter}>
                      <Text style={styles.commentTimestamp}>{formatTimestamp(comment.created_at)}</Text>
                      <View style={styles.reactionRow}>
                        <Pressable
                          style={[styles.commentReactionButton, comment.viewer_reaction === 'like' && styles.reactionButtonActive]}
                          onPress={() => handleCommentReaction(comment.id, comment.viewer_reaction === 'like' ? 'clear' : 'like')}>
                          <Text style={styles.reactionLabel}>👍 {comment.likes_count}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.commentReactionButton, comment.viewer_reaction === 'unlike' && styles.reactionButtonActive]}
                          onPress={() => handleCommentReaction(comment.id, comment.viewer_reaction === 'unlike' ? 'clear' : 'unlike')}>
                          <Text style={styles.reactionLabel}>👎 {comment.unlikes_count}</Text>
                        </Pressable>
                      </View>
                      {canModerate ? (
                        <Pressable
                          style={styles.commentModerateButton}
                          disabled={commentVisibilityUpdating === comment.id}
                          onPress={() => handleCommentVisibilityToggle(comment.id, !comment.is_hidden)}>
                          <Text style={styles.commentModerateLabel}>
                            {comment.is_hidden ? (commentVisibilityUpdating === comment.id ? 'Restoring…' : 'Unhide') : commentVisibilityUpdating === comment.id ? 'Hiding…' : 'Hide'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
              <View style={styles.commentComposer}>
                <TextInput
                  value={commentBody}
                  onChangeText={setCommentBody}
                  placeholder={authenticated ? 'Share an update' : 'Sign in to comment'}
                  placeholderTextColor="#94a3b8"
                  style={styles.commentInput}
                  multiline
                />
                <View style={styles.commentAttachmentRow}>
                  {commentMedia.map((media) => (
                    <View key={media.id} style={styles.commentAttachment}>
                      {media.media_type === 'image' ? (
                        <Image source={{ uri: media.uri }} style={styles.commentAttachmentImage} />
                      ) : (
                        <View style={[styles.commentAttachmentImage, styles.commentAttachmentVideo]}>
                          <Text style={styles.commentAttachmentVideoLabel}>Video</Text>
                        </View>
                      )}
                      <Pressable style={styles.commentAttachmentRemove} onPress={() => handleRemoveCommentMedia(media.id)}>
                        <Text style={styles.commentAttachmentRemoveLabel}>×</Text>
                      </Pressable>
                    </View>
                  ))}
                  {commentMedia.length < COMMENT_MEDIA_LIMIT ? (
                    <Pressable style={styles.commentAddAttachment} onPress={handleAddCommentMedia}>
                      <Text style={styles.commentAddAttachmentLabel}>+</Text>
                    </Pressable>
                  ) : null}
                </View>
                {commentMediaError ? <Text style={styles.error}>{commentMediaError}</Text> : null}
                <Pressable style={styles.commentSubmit} disabled={commentLoading || !commentBody.trim()} onPress={handleCommentSubmit}>
                  <Text style={styles.commentSubmitLabel}>{commentLoading ? 'Posting…' : 'Post'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
      {mapRegion ? (
        <Modal visible={mapExpanded} transparent animationType="fade" onRequestClose={() => setMapExpanded(false)}>
          <View style={styles.mapModalOverlay}>
            <Pressable style={styles.mapModalBackdrop} onPress={() => setMapExpanded(false)}>
              <Text style={{ opacity: 0 }}>Close</Text>
            </Pressable>
            <View style={styles.mapModalContainer}>
              <MapView style={styles.mapModalMap} initialRegion={mapRegion}>
                <Marker coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }} />
              </MapView>
              <Pressable style={styles.mapModalClose} onPress={() => setMapExpanded(false)}>
                <Text style={styles.mapModalCloseLabel}>Close map</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#020617',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    fontSize: 20,
    color: '#475569',
    marginTop: -2,
  },
  incidentCategory: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  incidentDescription: {
    marginTop: 8,
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  incidentLocation: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748b',
  },
  mapCard: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  mapLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mapLinkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  mapLinkValue: {
    fontSize: 11,
    color: '#475569',
  },
  mapPreviewShell: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  mapPreview: {
    height: 160,
    width: '100%',
  },
  mapPreviewHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  mapPreviewHintLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
  attachmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  attachmentImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
  },
  attachmentVideo: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentVideoLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  metaText: {
    marginTop: 6,
    fontSize: 12,
    color: '#94a3b8',
  },
  hiddenBadge: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 4,
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: '#fef2f2',
  },
  reactionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  reactionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reactionButtonActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#4338ca',
  },
  reactionLabel: {
    fontSize: 12,
    color: '#0f172a',
  },
  followHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  followDueLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  followCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  followCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  followCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  followCardTimestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  followCardStatus: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  followCardNotes: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  followPromptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  followPromptChip: {
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    color: '#0f172a',
  },
  followComposer: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  followControlLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  followChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  followChipActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  followChipLabel: {
    fontSize: 11,
    color: '#475569',
  },
  followChipLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  followTextarea: {
    minHeight: 70,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  followInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
  },
  followSubmit: {
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    alignItems: 'center',
  },
  followSubmitDisabled: {
    opacity: 0.6,
  },
  followSubmitLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  followButton: {
    marginTop: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0f172a',
    paddingVertical: 10,
    alignItems: 'center',
  },
  followButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  followButtonMuted: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  followButtonMutedLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  followHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#94a3b8',
  },
  errorLabel: {
    marginTop: 6,
    fontSize: 12,
    color: '#b91c1c',
  },
  moderatorButton: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 8,
    alignItems: 'center',
  },
  moderatorButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  statusChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusChipActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#4338ca',
  },
  statusChipLabel: {
    fontSize: 11,
    color: '#475569',
  },
  statusChipLabelActive: {
    color: '#1e1b4b',
    fontWeight: '600',
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#020617',
    marginBottom: 8,
  },
  commentCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  commentCardHidden: {
    opacity: 0.65,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  commentHiddenBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 10,
    color: '#c2410c',
    backgroundColor: '#fff7ed',
  },
  commentBody: {
    marginTop: 4,
    fontSize: 12,
    color: '#475569',
  },
  commentAttachmentPreviewRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  commentFooter: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentTimestamp: {
    fontSize: 11,
    color: '#94a3b8',
  },
  commentReactionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commentModerateButton: {
    marginLeft: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff1f2',
  },
  commentModerateLabel: {
    fontSize: 11,
    color: '#b91c1c',
    fontWeight: '600',
  },
  commentComposer: {
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#fff',
  },
  commentInput: {
    minHeight: 60,
    fontSize: 13,
    color: '#0f172a',
  },
  commentAttachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  commentAttachment: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  commentAttachmentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  commentAttachmentVideo: {
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAttachmentVideoLabel: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  commentAttachmentRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAttachmentRemoveLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  commentAddAttachment: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  commentAddAttachmentLabel: {
    fontSize: 22,
    color: '#475569',
    marginTop: -2,
  },
  commentSubmit: {
    marginTop: 8,
    alignSelf: 'flex-end',
    borderRadius: 999,
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  commentSubmitLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  mapModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.65)',
  },
  mapModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  mapModalContainer: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  mapModalMap: {
    width: '100%',
    height: 360,
  },
  mapModalClose: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
  },
  mapModalCloseLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  error: {
    color: '#b91c1c',
    textAlign: 'center',
  },
});
