// Finds and decodes a QR code in a picture. Schedule flyers are often designed
// with light-on-colour QR codes (white dots on pink), which scanners read badly
// — so the picture is also converted to pure black/white at several
// brightness thresholds, in both polarities, until something decodes.
const THRESHOLDS = [200, 220, 180, 240, 160];

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function binarize(src: ImageData, threshold: number, brightIsInk: boolean): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const lum = 0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2];
    const ink = (lum > threshold) === brightIsInk ? 0 : 255;
    out[i] = out[i + 1] = out[i + 2] = ink;
    out[i + 3] = 255;
  }
  return out;
}

function scaleDown(image: ImageData, maxEdge: number): ImageData {
  const factor = maxEdge / Math.max(image.width, image.height);
  if (factor >= 1) return image;
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  source.getContext("2d")?.putImageData(image, 0, 0);
  const target = document.createElement("canvas");
  target.width = Math.round(image.width * factor);
  target.height = Math.round(image.height * factor);
  const ctx = target.getContext("2d");
  if (!ctx) return image;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, target.width, target.height);
  return ctx.getImageData(0, 0, target.width, target.height);
}

// First on a smaller copy (fast, enough for a flyer's QR code), then at full
// size for small codes in photos.
export async function decodeQr(original: ImageData): Promise<string | null> {
  const { default: jsQR } = await import("jsqr");
  const attempt = (image: ImageData, data: Uint8ClampedArray): string | null => {
    try {
      return jsQR(data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data || null;
    } catch {
      // jsQR throws on some odd inputs; just treat it as "not found".
      return null;
    }
  };

  for (const edge of [1100, Infinity]) {
    const image = scaleDown(original, edge);
    const plain = attempt(image, image.data);
    if (plain) return plain;
    for (const threshold of THRESHOLDS) {
      for (const brightIsInk of [true, false]) {
        await tick(); // keep the page responsive between the (slow) full-picture scans
        const found = attempt(image, binarize(image, threshold, brightIsInk));
        if (found) return found;
      }
    }
    if (image === original) break;
  }
  return null;
}
