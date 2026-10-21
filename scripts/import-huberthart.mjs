import { access, copyFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// Copy original PNGs only. Do not execute the Unity demo or modify the artwork.
const source = process.argv[2];
if (!source) {
  console.error(
    'Usage: node scripts/import-huberthart.mjs "/path/to/extracted/Free"',
  );
  process.exit(1);
}
const destination = fileURLToPath(
  new URL("../public/assets/huberthart/", import.meta.url),
);
const files = ["Monk", "Hood"].map((name) => ({
  from: resolve(source, "Art", name, `${name}.png`),
  to: join(destination, `${name}.png`),
}));
await Promise.all(files.map(({ from }) => access(from)));
await mkdir(destination, { recursive: true });
await Promise.all(files.map(({ from, to }) => copyFile(from, to)));
console.log(
  "Imported Monk and Hood for local use. Artwork remains excluded from Git.",
);
