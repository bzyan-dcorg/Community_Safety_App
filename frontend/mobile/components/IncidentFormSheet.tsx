import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { createIncident, fetchTaxonomy, TaxonomyResponse } from '@/utils/api';

type IncidentFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const INCIDENT_TYPES = [
  { id: 'community', label: 'Community' },
  { id: 'police', label: 'Police' },
  { id: 'public-order', label: 'Public order' },
];

const CONTACT_OPTIONS = [
  { id: 'unknown', label: 'Unknown' },
  { id: 'none', label: 'None' },
  { id: 'service-request', label: '311 / Service' },
  { id: '911', label: '911' },
  { id: 'not-needed', label: 'Not needed' },
];

const SENTIMENT_OPTIONS = [
  { id: 'safe', label: 'Safe' },
  { id: 'uneasy', label: 'Uneasy' },
  { id: 'unsafe', label: 'Unsafe' },
  { id: 'unsure', label: 'Unsure' },
];

export function IncidentFormSheet({ visible, onClose, onCreated }: IncidentFormSheetProps) {
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [incidentType, setIncidentType] = useState('community');
  const [contacted, setContacted] = useState('unknown');
  const [sentiment, setSentiment] = useState('unsure');
  const [stillHappening, setStillHappening] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taxonomy, setTaxonomy] = useState<TaxonomyResponse | null>(null);
  const [taxonomyLoading, setTaxonomyLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTaxonomyLoading(true);
    fetchTaxonomy()
      .then(setTaxonomy)
      .catch((err) => console.warn('Taxonomy failed', err))
      .finally(() => setTaxonomyLoading(false));
  }, [visible]);

  const categorySuggestions = useMemo(() => {
    if (!taxonomy) return [];
    return [
      ...(taxonomy.community_civic?.items || []),
      ...(taxonomy.police_related?.items || []),
      ...(taxonomy.public_order?.items || []),
    ];
  }, [taxonomy]);

  const canSubmit = category.trim().length > 0 && description.trim().length > 0;

  const reset = useCallback(() => {
    setCategory('');
    setDescription('');
    setLocation('');
    setIncidentType('community');
    setContacted('unknown');
    setSentiment('unsure');
    setStillHappening(null);
    setError('');
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await createIncident({
        category: category.trim(),
        description: description.trim(),
        location_text: location.trim() || undefined,
        incident_type: incidentType,
        contacted_authorities: contacted,
        safety_sentiment: sentiment,
        still_happening: stillHappening,
      });
      reset();
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit incident.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => { reset(); onClose(); }}>
        <Text style={{ opacity: 0 }}>Close</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.closeButton} onPress={() => { reset(); onClose(); }}>
          <Text style={styles.closeLabel}>×</Text>
        </Pressable>
        <Text style={styles.title}>Report a new signal</Text>
        <Text style={styles.subtitle}>Fill in quick details so neighbors and staff can act faster.</Text>

        <Text style={styles.label}>Category</Text>
        <TextInput
          value={category}
          onChangeText={setCategory}
          placeholder="e.g. Package theft"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />
        {taxonomyLoading ? <ActivityIndicator color="#0f172a" style={{ marginTop: 6 }} /> : null}
        {!taxonomyLoading && categorySuggestions.length ? (
          <View style={styles.chipRow}>
            {categorySuggestions.slice(0, 6).map((item) => (
              <Pressable key={item} style={styles.chip} onPress={() => setCategory(item)}>
                <Text style={styles.chipLabel}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What happened?"
          placeholderTextColor="#94a3b8"
          style={[styles.input, { minHeight: 80 }]}
          multiline
        />

        <Text style={styles.label}>Location</Text>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Intersection, block, or landmark"
          placeholderTextColor="#94a3b8"
          style={styles.input}
        />

        <Text style={styles.label}>Incident type</Text>
        <View style={styles.chipRow}>
          {INCIDENT_TYPES.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.chip, incidentType === option.id && styles.chipActive]}
              onPress={() => setIncidentType(option.id)}>
              <Text style={[styles.chipLabel, incidentType === option.id && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Contacted authorities?</Text>
        <View style={styles.chipRow}>
          {CONTACT_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.chip, contacted === option.id && styles.chipActive]}
              onPress={() => setContacted(option.id)}>
              <Text style={[styles.chipLabel, contacted === option.id && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Safety sentiment</Text>
        <View style={styles.chipRow}>
          {SENTIMENT_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.chip, sentiment === option.id && styles.chipActive]}
              onPress={() => setSentiment(option.id)}>
              <Text style={[styles.chipLabel, sentiment === option.id && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Is it still happening?</Text>
        <View style={styles.chipRow}>
          {[
            { id: true, label: 'Yes' },
            { id: false, label: 'No' },
            { id: null, label: 'Unsure' },
          ].map((option) => (
            <Pressable
              key={String(option.id)}
              style={[styles.chip, stillHappening === option.id && styles.chipActive]}
              onPress={() => setStillHappening(option.id)}>
              <Text style={[styles.chipLabel, stillHappening === option.id && styles.chipLabelActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.submitButton, !canSubmit && { opacity: 0.6 }]} disabled={!canSubmit || loading} onPress={handleSubmit}>
          <Text style={styles.submitLabel}>{loading ? 'Submitting…' : 'Submit incident'}</Text>
        </Pressable>
      </ScrollView>
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
    maxHeight: '90%',
  },
  closeButton: {
    alignSelf: 'flex-end',
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#020617',
    marginTop: 4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  label: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  input: {
    marginTop: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#4338ca',
  },
  chipLabel: {
    fontSize: 12,
    color: '#475569',
  },
  chipLabelActive: {
    color: '#1e1b4b',
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 20,
    borderRadius: 24,
    backgroundColor: '#0f172a',
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitLabel: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  error: {
    marginTop: 12,
    color: '#b91c1c',
  },
});
