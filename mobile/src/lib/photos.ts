import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { authHeaders, getServerUrl } from './api';

// Phone photos are 3–12 MB; shrink to this width and JPEG quality so uploads are quick on weak
// signal (~200–400 KB each) and still clear enough to show a fault on the report.
const MAX_WIDTH = 1600;
const QUALITY = 0.7;
const MAX_PICK = 5;

// Opens the camera or gallery and returns the chosen photos, shrunk, as data URIs ready to upload.
// Returns [] if the user cancels; throws with a readable message if permission is refused.
export async function pickPhotos(source: 'camera' | 'library'): Promise<string[]> {
  const perm =
    source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error(source === 'camera' ? 'Camera permission is off. Allow it in phone Settings.' : 'Photo access is off. Allow it in phone Settings.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: MAX_PICK });
  if (result.canceled) return [];

  const out: string[] = [];
  for (const asset of result.assets) {
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (asset.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
    if (saved.base64) out.push(`data:image/jpeg;base64,${saved.base64}`);
  }
  return out;
}

// Image source for a stored job photo (sends the login so only staff can see it).
export function photoSource(jobId: number, photoId: number) {
  return { uri: `${getServerUrl()}/api/jobs/${jobId}/photos/${photoId}`, headers: authHeaders() };
}
