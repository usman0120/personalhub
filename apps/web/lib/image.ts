"use client";

/** Resizes an image to `maxEdge` px on the long edge and encodes WebP. Returns base64 (no data: prefix). */
export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.8): Promise<{ base64: string; width: number; height: number; bytes: number; blob: Blob }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/webp", quality));
  return { base64: await blobToBase64(blob), width, height, bytes: blob.size, blob };
}

/** Small thumbnail ≤ 400 px and ≤ 60 KB (lowers quality until it fits). */
export async function makeThumbnail(file: Blob): Promise<string | null> {
  for (const q of [0.7, 0.55, 0.4, 0.3]) {
    const t = await compressImage(file, 400, q);
    if (t.bytes <= 60_000) return t.base64;
  }
  return null;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
