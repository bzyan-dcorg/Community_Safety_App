import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Incident, IncidentComment, createComment, fetchIncident, setCommentReaction, setIncidentReaction, setIncidentVisibility, setCommentVisibility, updateIncidentStatus } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';

type IncidentDetailSheetProps = {
  incidentId: number | null;
  visible: boolean;
  onClose: () => void;
  onMutated?: () => void;
  onRequireAuth?: () => void;
};

const MODERATOR_ROLES = new Set(['admin', 'officer']);
const APPROVER_ROLES = new Set(['staff', 'reporter', 'officer', 'admin']);
const STATUS_OPTIONS = [
  { id: 'unverified', label: 'Unverified' },
  { id: 'community-confirmed', label: 'Community confirmed' },
  { id: 'official-confirmed', label: 'Official confirmed' },
  { id: 'resolved', label: 'Resolved' },
];

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

  const canModerate = useMemo(() => (user?.role ? MODERATOR_ROLES.has(user.role) : false), [user?.role]);
  const canApprove = useMemo(() => (user?.role ? APPROVER_ROLES.has(user.role) : false), [user?.role]);

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
      const newComment = await createComment(incidentId, { body: commentBody.trim() });
      setIncident({ ...incident, comments: [newComment, ...(incident.comments || [])] });
      setCommentBody('');
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
              <Text style={styles.sectionTitle}>Comments</Text>
              {incident.comments.length === 0 ? (
                <Text style={styles.metaText}>No comments yet.</Text>
              ) : (
                incident.comments.map((comment) => (
                  <View key={comment.id} style={[styles.commentCard, comment.is_hidden && styles.commentCardHidden]}>
                    <Text style={styles.commentAuthor}>{comment.user?.display_name || comment.user?.email}</Text>
                    {comment.is_hidden ? <Text style={styles.commentHiddenBadge}>Hidden</Text> : null}
                    <Text style={styles.commentBody}>{comment.body}</Text>
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
                <Pressable style={styles.commentSubmit} disabled={commentLoading || !commentBody.trim()} onPress={handleCommentSubmit}>
                  <Text style={styles.commentSubmitLabel}>{commentLoading ? 'Posting…' : 'Post'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </View>
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
  error: {
    color: '#b91c1c',
    textAlign: 'center',
  },
});
