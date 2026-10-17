// Generates the iOS home-screen launch images (public/splash/*.png): the app
// icon centred on the brand navy. Run: node scripts/generate-splash.mjs
import sharp from "sharp";

const NAVY = { r: 0x14, g: 0x22, b: 0x3f, alpha: 1 };
// width x height in CSS px, device pixel ratio
const DEVICES = [
  [440, 956, 3],
  [402, 874, 3],
  [430, 932, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [375, 667, 2],
];

for (const [w, h, dpr] of DEVICES) {
  const width = w * dpr;
  const height = h * dpr;
  const icon = await sharp("public/icons/icon-512.png")
    .resize(Math.round(width * 0.26))
    .toBuffer();
  await sharp({ create: { width, height, channels: 4, background: NAVY } })
    .composite([{ input: icon, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(`public/splash/${w}x${h}@${dpr}x.png`);
}
console.log("done");
