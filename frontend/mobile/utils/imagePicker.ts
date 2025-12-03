import * as ImagePicker from 'expo-image-picker';

const FALLBACK_NATIVE_MEDIA_TYPES = ['images', 'videos', 'livePhotos'] as const;

function shouldRetryWithNativeArray(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes('mediaTypes') && error.message.includes('MediaType');
}

// Expo SDK 51+ on native expects an array of media types; older runtimes still accept the enum.
// Retry with the array format when the old enum string ('All') is rejected.
export async function launchImageLibraryCompat(options: ImagePicker.ImagePickerOptions) {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    if (options.mediaTypes === ImagePicker.MediaTypeOptions.All && shouldRetryWithNativeArray(error)) {
      return await ImagePicker.launchImageLibraryAsync({
        ...options,
        mediaTypes: FALLBACK_NATIVE_MEDIA_TYPES as unknown as ImagePicker.MediaTypeOptions,
      });
    }
    throw error;
  }
}
