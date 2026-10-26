// Turns an uploaded flyer (photo or PDF) into a canvas we can scan for a QR
// code and send, as a compact JPEG, to the text recognition.
const MAX_EDGE = 2000;

export interface FlyerImage {
  imageData: ImageData;
  jpegBase64: string;
}

function fromCanvas(canvas: HTMLCanvasElement): FlyerImage {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const jpegBase64 = canvas.toDataURL("image/jpeg", 0.88).split(",")[1] ?? "";
  return { imageData, jpegBase64 };
}

async function renderPdf(file: File): Promise<HTMLCanvasElement> {
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
  return canvas;
}

async function renderPhoto(file: File): Promise<HTMLCanvasElement> {
  // imageOrientation "from-image" applies the phone's rotation flag.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function loadFlyer(file: File): Promise<FlyerImage> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return fromCanvas(isPdf ? await renderPdf(file) : await renderPhoto(file));
}
