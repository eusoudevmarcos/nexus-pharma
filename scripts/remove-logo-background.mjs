import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(root, "public", "logo", "Logo Nexus pharma.png");
const output = path.join(
  root,
  "public",
  "logo",
  "Logo Nexus pharma transparente.png",
);

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let index = 0; index < data.length; index += info.channels) {
  const red = data[index];
  const green = data[index + 1];
  const blue = data[index + 2];
  const originalAlpha = data[index + 3] / 255;
  const distanceFromWhite = Math.max(255 - red, 255 - green, 255 - blue);
  const keyAlpha = Math.max(0, Math.min(1, (distanceFromWhite - 10) / 64));
  const finalAlpha = originalAlpha * keyAlpha;

  if (finalAlpha <= 0.002) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 0;
    continue;
  }

  const recover = (channel) =>
    Math.max(
      0,
      Math.min(
        255,
        Math.round((channel - 255 * (1 - keyAlpha)) / keyAlpha),
      ),
    );

  data[index] = recover(red);
  data[index + 1] = recover(green);
  data[index + 2] = recover(blue);
  data[index + 3] = Math.round(finalAlpha * 255);
}

await sharp(data, { raw: info }).png().toFile(output);
console.log(output);
