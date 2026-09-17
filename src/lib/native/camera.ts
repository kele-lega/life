import { isNativeApp } from "@/lib/runtime/platform";

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "jpg";
}

async function mediaToFile(media: { webPath?: string; uri?: string; type?: number }, name: string): Promise<File | null> {
  const src = media.webPath ?? media.uri;
  if (!src) return null;
  const response = await fetch(src);
  if (!response.ok) return null;
  const blob = await response.blob();
  if (blob.size === 0) return null;
  const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const ext = extensionFor(type);
  const fileName = name.includes(".") ? name : `${name}.${ext}`;
  return new File([blob], fileName, { type });
}

function cancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

export async function pickNativeImages(): Promise<File[]> {
  if (!isNativeApp()) return [];
  try {
    const { Camera, MediaType, MediaTypeSelection } = await import("@capacitor/camera");
    const picked = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: true,
      quality: 90,
      correctOrientation: true,
    });
    const files: File[] = [];
    for (const [index, media] of picked.results.entries()) {
      if (media.type === MediaType.Video) continue;
      const file = await mediaToFile(media, `gallery-${index + 1}`);
      if (file) files.push(file);
    }
    return files;
  } catch (error) {
    if (cancelled(error)) return [];
    return [];
  }
}

export async function takeNativePhoto(): Promise<File | null> {
  if (!isNativeApp()) return null;
  try {
    const { Camera, EncodingType, MediaType } = await import("@capacitor/camera");
    const photo = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      saveToGallery: false,
      encodingType: EncodingType.JPEG,
    });
    if (photo.type === MediaType.Video) return null;
    return mediaToFile(photo, `photo-${Date.now()}`);
  } catch (error) {
    if (cancelled(error)) return null;
    return null;
  }
}
