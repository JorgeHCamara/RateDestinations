// MapLibre runs its tile parsing in a Web Worker. Bundlers rewrite the worker's URL in ways
// that break under Turbopack, so the worker file is served as a static asset and the map
// points at it explicitly (see src/components/city-map.tsx). Runs before dev and build.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(
  path.dirname(require.resolve("maplibre-gl/package.json")),
  "dist",
  "maplibre-gl-worker.mjs",
);
const dest = path.join(process.cwd(), "public", "maplibre-gl-worker.mjs");
await mkdir(path.dirname(dest), { recursive: true });
await copyFile(src, dest);
