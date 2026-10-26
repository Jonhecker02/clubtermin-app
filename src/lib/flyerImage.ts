import { readGpsPdf } from "@/lib/gpsPdf";
import type { GpsEntry } from "@/lib/gps";

// Opens the club's monthly GPS schedule (a PDF) and hands back its tournaments
// plus the rendered page, in which the QR code with the registration link is
// searched. Nothing is uploaded anywhere.
const MAX_EDGE = 2000;

export interface FlyerImage {
  imageData: ImageData;
  // null when the PDF is not laid out like the club's schedule.
  entries: GpsEntry[] | null;
}

export async function loadFlyer(file: File): Promise<FlyerImage> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: "/pdfjs/wasm/" }).promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(3, MAX_EDGE / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  let entries: GpsEntry[] | null = null;
  try {
    entries = await readGpsPdf(page, canvas, viewport);
  } catch {
    // The recognition could not start; the page then offers manual entry.
  }
  return { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), entries };
}
