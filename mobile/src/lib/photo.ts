import { ActionSheetIOS, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { MediaType } from 'expo-image-picker';

export const PHOTO_MAX_CHARS = 100_000; // server limit (~75 KB of JPEG)
const JPEG_DATA_URL = /^data:image\/jpeg;base64,\/9j\//;

export const photoPickingAvailable = (): boolean =>
  !!requireOptionalNativeModule('ExponentImagePicker') && !!requireOptionalNativeModule('ExpoImageManipulator');

type Source = 'library' | 'camera';

/** Asks library vs camera (and remove, if a photo exists). Resolves the choice or null if cancelled. */
export function askPhotoSource(hasPhoto: boolean): Promise<Source | 'remove' | null> {
  const opts: (Source | 'remove')[] = ['library', 'camera', ...(hasPhoto ? (['remove'] as const) : [])];
  const labels = opts.map((o) => (o === 'library' ? 'Choose from Library' : o === 'camera' ? 'Take Photo' : 'Remove Photo'));
  return new Promise((resolve) => {
    if (Platform.OS !== 'ios') return resolve('library');
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...labels, 'Cancel'],
        cancelButtonIndex: labels.length,
        destructiveButtonIndex: hasPhoto ? opts.indexOf('remove') : undefined,
        userInterfaceStyle: 'dark',
      },
      (i) => resolve(i < opts.length ? opts[i]! : null),
    );
  });
}

/**
 * Lets the user pick or take a photo, crops it square, scales to 256 px and re-encodes as JPEG.
 * Re-encoding drops EXIF metadata (including GPS). Returns a data URL, or null if cancelled.
 */
export async function pickProfilePhoto(source: Source): Promise<string | null> {
  if (!photoPickingAvailable()) throw new Error('Photo upload needs the latest SafeNight build. Rebuild the app from Xcode.');
  const Picker = await import('expo-image-picker');
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  const perm = source === 'camera' ? await Picker.requestCameraPermissionsAsync() : { granted: true };
  if (!perm.granted) throw new Error('Camera access is off. Turn it on in Settings → SafeNight.');
  const opts = { mediaTypes: ['images'] as MediaType[], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 1, exif: false };
  const res = source === 'camera' ? await Picker.launchCameraAsync(opts) : await Picker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const side = Math.min(a.width, a.height);
  const crop = side > 0 ? [{ crop: { originX: (a.width - side) / 2, originY: (a.height - side) / 2, width: side, height: side } }] : [];
  for (const compress of [0.7, 0.5, 0.35]) {
    const out = await manipulateAsync(a.uri, [...crop, { resize: { width: 256, height: 256 } }], { compress, format: SaveFormat.JPEG, base64: true });
    const url = `data:image/jpeg;base64,${out.base64 ?? ''}`;
    if (JPEG_DATA_URL.test(url) && url.length <= PHOTO_MAX_CHARS) return url;
  }
  throw new Error('That photo is too detailed to upload. Try another one.');
}
