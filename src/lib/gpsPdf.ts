import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { rowsFromTextBits, timeFromOcr, type GpsEntry } from "@/lib/gps";

// Reads the club's GPS schedule PDF without any AI: weekday, date and title
// come straight from the PDF's text, the start times (drawn as shapes, not
// text) are read from the rendered page with a small text recognition that
// runs in the browser from files of our own server (nothing leaves the app).
// Returns null when the page does not look like such a schedule.
export async function readGpsPdf(page: PDFPageProxy, canvas: HTMLCanvasElement, viewport: PageViewport): Promise<GpsEntry[] | null> {
  const content = await page.getTextContent();
  const bits = content.items.flatMap((item) => ("str" in item ? [{ str: item.str, x: item.transform[4], y: item.transform[5] }] : []));
  const { rows, pitch } = rowsFromTextBits(bits);
  if (rows.length === 0) return null;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-lstm.wasm.js",
    langPath: "/tesseract",
    gzip: true,
    cacheMethod: "none",
  });
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789:", tessedit_pageseg_mode: "7" as never });
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const left = Math.floor(canvas.width * 0.6);
    const width = canvas.width - left;
    const halfBand = Math.max(8, pitch * viewport.scale * 0.42);
    const entries: GpsEntry[] = [];
    for (const row of rows) {
      const [, centerY] = viewport.convertToViewportPoint(0, row.y);
      const top = Math.max(0, Math.round(centerY - halfBand));
      const height = Math.min(canvas.height - top, Math.round(halfBand * 2));
      // Black text on white, with a margin, is what the recognition likes best.
      const band = document.createElement("canvas");
      band.width = width + 40;
      band.height = height + 40;
      const bandCtx = band.getContext("2d");
      if (!bandCtx) continue;
      const source = ctx.getImageData(left, top, width, height);
      const out = bandCtx.createImageData(width, height);
      for (let i = 0; i < source.data.length; i += 4) {
        const lum = 0.299 * source.data[i] + 0.587 * source.data[i + 1] + 0.114 * source.data[i + 2];
        const v = lum < 120 ? 0 : 255;
        out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
        out.data[i + 3] = 255;
      }
      bandCtx.fillStyle = "#fff";
      bandCtx.fillRect(0, 0, band.width, band.height);
      bandCtx.putImageData(out, 20, 20);
      const { data } = await worker.recognize(band);
      entries.push({ weekday: row.weekday, day: row.day, month: row.month, title: row.title, time: timeFromOcr(data.text) ?? "" });
    }
    return entries;
  } finally {
    await worker.terminate();
  }
}
