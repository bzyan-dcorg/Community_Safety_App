import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, MapPressEvent } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { createIncident, fetchTaxonomy, TaxonomyResponse } from '@/utils/api';
import { launchImageLibraryCompat } from '@/utils/imagePicker';

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

const DEFAULT_REGION = {
  latitude: 38.9072,
  longitude: -77.0369,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const MAX_MEDIA = 3;

const PILOT_CATEGORIES = [
  'Sightings of city workers',
  'Community activities or programs',
  'Conflict mediation or disputes',
  'Perceived safety shift',
  'Public space or infrastructure watch',
];

const CATEGORY_HINTS: Record<string, string> = {
  'Sightings of city workers': 'Crews, contractors, or agency staff visible on your block.',
  'Community activities or programs': 'Block parties, youth programs, mutual aid, or pop-ups.',
  'Conflict mediation or disputes': 'Noise complaints, disputes, or when mediation could help.',
  'Perceived safety shift': 'Moments when the street suddenly feels safer or uneasy.',
  'Public space or infrastructure watch': 'Streetlights, bus stops, trash, or space conditions.',
};

type MediaUpload = {
  id: string;
  uri: string;
  media_type: 'image' | 'video';
  content_type: string;
  data_base64: string;
  filename?: string;
};

function generateNearbyPrompts(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return [];
  return [
    `City crews near ${lat.toFixed(3)}° / ${lng.toFixed(3)}°?`,
    'Would mediation or lighting help nearby blocks?',
    'Add a quick photo to guide verifiers on scene.',
  ];
}

export function IncidentFormSheet({ visible, onClose, onCreated }: IncidentFormSheetProps) {
  const [category, setCategory] = useState<string>(PILOT_CATEGORIES[0]);
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
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [mediaUploads, setMediaUploads] = useState<MediaUpload[]>([]);
  const [mediaError, setMediaError] = useState('');
  const [mapInteractive, setMapInteractive] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTaxonomyLoading(true);
    fetchTaxonomy()
      .then(setTaxonomy)
      .catch((err) => console.warn('Taxonomy failed', err))
      .finally(() => setTaxonomyLoading(false));
  }, [visible]);

  const categoryOptions = useMemo(() => {
    if (!taxonomy) {
      return [...PILOT_CATEGORIES];
    }
    const merged = [
      ...(taxonomy.police_related?.items || []),
      ...(taxonomy.community_civic?.items || []),
      ...(taxonomy.public_order?.items || []),
    ].filter((item): item is string => Boolean(item && item.trim().length));
    if (!merged.length) {
      return [...PILOT_CATEGORIES];
    }
    return Array.from(new Set(merged));
  }, [taxonomy]);

  useEffect(() => {
    if (!categoryOptions.length) return;
    setCategory((prev) => (categoryOptions.includes(prev) ? prev : categoryOptions[0]));
  }, [categoryOptions]);

  const canSubmit = category.trim().length > 0 && description.trim().length > 0;
  const nearbyPrompts = useMemo(() => generateNearbyPrompts(lat, lng), [lat, lng]);
  const mapRegion = useMemo(
    () => ({
      ...DEFAULT_REGION,
      ...(lat != null && lng != null ? { latitude: lat, longitude: lng } : {}),
    }),
    [lat, lng],
  );

  const reset = useCallback(() => {
    setCategory(categoryOptions[0] || PILOT_CATEGORIES[0]);
    setDescription('');
    setLocation('');
    setIncidentType('community');
    setContacted('unknown');
    setSentiment('unsure');
    setStillHappening(null);
    setLat(null);
    setLng(null);
    setMediaUploads([]);
    setMediaError('');
    setError('');
    setMapInteractive(false);
  }, [categoryOptions]);

  const handleMapPress = (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setLat(latitude);
    setLng(longitude);
    if (mapInteractive) {
      // Return to scrollable mode shortly after placing the pin.
      setTimeout(() => setMapInteractive(false), 150);
    }
  };

  const handleUseLocation = async () => {
    try {
      setLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setError('Location permission is required to drop a pin.');
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(current.coords.latitude);
      setLng(current.coords.longitude);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch current location.');
    } finally {
      setLocating(false);
    }
  };

  const handleAddMedia = async () => {
    if (mediaUploads.length >= MAX_MEDIA) {
      setMediaError('You can attach up to three files.');
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
    if (!asset.base64) {
      setMediaError('Unable to attach that file.');
      return;
    }
    setMediaError('');
    setMediaUploads((prev) => [
      ...prev,
      {
        id: `${asset.assetId || asset.uri}-${Date.now()}`,
        uri: asset.uri,
        media_type: asset.type === 'video' ? 'video' : 'image',
        content_type: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        data_base64: asset.base64,
        filename: asset.fileName,
      },
    ]);
  };

  const handleRemoveMedia = (id: string) => {
    setMediaUploads((prev) => prev.filter((item) => item.id !== id));
  };

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
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        media: mediaUploads.map((media) => ({
          media_type: media.media_type,
          content_type: media.content_type,
          data_base64: media.data_base64,
          filename: media.filename,
        })),
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (mapInteractive) {
      timer = setTimeout(() => setMapInteractive(false), 15000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [mapInteractive]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => { reset(); onClose(); }}>
        <Text style={{ opacity: 0 }}>Close</Text>
      </Pressable>
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheet}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Pressable style={styles.closeButton} onPress={() => { reset(); onClose(); }}>
          <Text style={styles.closeLabel}>×</Text>
        </Pressable>
        <Text style={styles.title}>Report a new signal</Text>
        <Text style={styles.subtitle}>Fill in quick details so neighbors and staff can act faster.</Text>

        <View style={styles.labelRow}>
          <Text style={styles.label}>Category</Text>
          {taxonomyLoading ? <ActivityIndicator color="#0f172a" size="small" /> : null}
        </View>
        <View style={styles.radioGroup}>
          {categoryOptions.map((option, index) => {
            const active = option === category;
            return (
              <Pressable
                key={option}
                style={[
                  styles.radioOption,
                  active && styles.radioOptionActive,
                  index !== categoryOptions.length - 1 && styles.radioOptionSpacing,
                ]}
                onPress={() => setCategory(option)}>
                <View style={[styles.radioBullet, active && styles.radioBulletActive]} />
                <View style={styles.radioCopy}>
                  <Text style={styles.radioLabel}>{option}</Text>
                  {CATEGORY_HINTS[option] ? <Text style={styles.radioHint}>{CATEGORY_HINTS[option]}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="What happened?"
          placeholderTextColor="#94a3b8"
          style={[styles.input, { minHeight: 80 }]}
          multiline
        />

        <Text style={styles.label}>Drop a map pin</Text>
        <View style={styles.mapWrapper}>
          <MapView
            style={styles.map}
            region={mapRegion}
            onPress={handleMapPress}
            pointerEvents={mapInteractive ? 'auto' : 'none'}
            scrollEnabled={mapInteractive}
            zoomEnabled={mapInteractive}
            rotateEnabled={mapInteractive}
            pitchEnabled={mapInteractive}>
            {lat != null && lng != null ? <Marker coordinate={{ latitude: lat, longitude: lng }} /> : null}
          </MapView>
          {!mapInteractive ? (
            <Pressable style={styles.mapLockChip} onPress={() => setMapInteractive(true)}>
              <Text style={styles.mapLockChipLabel}>Tap to drop a pin</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.mapActions}>
          <Text style={styles.mapLabel}>
            {lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'Tap anywhere to set a pin'}
          </Text>
          <Pressable style={styles.mapButton} onPress={handleUseLocation} disabled={locating}>
            <Text style={styles.mapButtonLabel}>{locating ? 'Locating…' : 'Use my location'}</Text>
          </Pressable>
        </View>
        <View style={[styles.mapInteractionBanner, mapInteractive && styles.mapInteractionBannerActive]}>
          <Text style={styles.mapInteractionLabel}>
            {mapInteractive
              ? 'Map gestures enabled — drag or tap to move the pin.'
              : 'Map locked so you can keep scrolling.'}
          </Text>
          <Pressable
            style={[styles.mapInteractionToggle, mapInteractive && styles.mapInteractionToggleActive]}
            onPress={() => setMapInteractive((prev) => !prev)}>
            <Text style={[styles.mapInteractionToggleLabel, mapInteractive && styles.mapInteractionToggleLabelActive]}>
              {mapInteractive ? 'Done' : 'Pan map'}
            </Text>
          </Pressable>
        </View>
        {nearbyPrompts.length ? (
          <View style={styles.promptBox}>
            {nearbyPrompts.map((prompt) => (
              <Text key={prompt} style={styles.promptText}>
                • {prompt}
              </Text>
            ))}
          </View>
        ) : null}
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Nearest intersection or landmark"
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

        <Text style={styles.label}>Optional photo or clip</Text>
        <View style={styles.attachmentRow}>
          {mediaUploads.map((media) => (
            <View key={media.id} style={styles.attachment}>
              <Image source={{ uri: media.uri }} style={styles.attachmentImage} />
              <Pressable style={styles.removeAttachment} onPress={() => handleRemoveMedia(media.id)}>
                <Text style={styles.removeAttachmentLabel}>×</Text>
              </Pressable>
            </View>
          ))}
          {mediaUploads.length < MAX_MEDIA ? (
            <Pressable style={styles.addAttachment} onPress={handleAddMedia}>
              <Text style={styles.addAttachmentLabel}>+</Text>
            </Pressable>
          ) : null}
        </View>
        {mediaError ? <Text style={styles.error}>{mediaError}</Text> : null}

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
    zIndex: 30,
    elevation: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.45)',
  },
  sheetScroll: {
    maxHeight: '90%',
    width: '100%',
    alignSelf: 'center',
  },
  sheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  radioGroup: {
    marginTop: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  radioOptionActive: {
    borderColor: '#4338ca',
    backgroundColor: '#eef2ff',
  },
  radioOptionSpacing: {
    marginBottom: 8,
  },
  radioBullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#cbd5f5',
    marginTop: 2,
  },
  radioBulletActive: {
    borderColor: '#4338ca',
    backgroundColor: '#4338ca',
  },
  radioCopy: {
    flex: 1,
    marginLeft: 12,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  radioHint: {
    marginTop: 2,
    fontSize: 11,
    color: '#475569',
  },
  mapWrapper: {
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  map: {
    height: 180,
  },
  mapActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  mapLabel: {
    fontSize: 12,
    color: '#475569',
  },
  mapButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapButtonLabel: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  mapInteractionBanner: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapInteractionBannerActive: {
    borderColor: '#4338ca',
    backgroundColor: '#eef2ff',
  },
  mapInteractionLabel: {
    flex: 1,
    fontSize: 11,
    color: '#475569',
    marginRight: 8,
  },
  mapInteractionToggle: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
  },
  mapInteractionToggleActive: {
    backgroundColor: '#0f172a',
  },
  mapInteractionToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  mapInteractionToggleLabelActive: {
    color: '#fff',
  },
  mapLockChip: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(2,6,23,0.7)',
  },
  mapLockChipLabel: {
    fontSize: 12,
    color: '#f8fafc',
    fontWeight: '600',
  },
  promptBox: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    backgroundColor: '#f8fafc',
  },
  promptText: {
    fontSize: 12,
    color: '#475569',
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  attachment: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  attachmentImage: {
    width: '100%',
    height: '100%',
  },
  removeAttachment: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAttachmentLabel: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  addAttachment: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  addAttachmentLabel: {
    fontSize: 24,
    color: '#475569',
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
