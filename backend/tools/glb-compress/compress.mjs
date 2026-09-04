#!/usr/bin/env node
/**
 * Shrink an uploaded furniture GLB in a single pass:
 *   - dedup / prune / weld : drop redundant accessors, unused data, merge verts
 *   - quantize             : KHR_mesh_quantization (loader-native, no decoder)
 *   - textureCompress      : resize textures to <=2048px and re-encode as WebP
 *   - meshopt              : EXT_meshopt_compression on geometry
 *
 * Usage:  node compress.mjs <in.glb> <out.glb>
 *
 * Exits 0 on success (out.glb written), non-zero on any failure so the Python
 * caller can fall back to storing the original, uncompressed file. Meshopt +
 * quantization are decoded by our web loaders (drei useGLTF enables the meshopt
 * decoder by default; the import pipeline sets it explicitly), and the mobile
 * app renders through a WebView of that same web studio, so both are covered.
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  quantize,
  textureCompress,
  meshopt,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node compress.mjs <in.glb> <out.glb>");
  process.exit(2);
}

async function main() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });

  const document = await io.read(inPath);

  await document.transform(
    dedup(),
    weld(),
    prune(),
    // Quantization must precede meshopt so the encoder packs the reduced-width
    // attributes; textureCompress is independent of geometry order.
    quantize(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048] }),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  await io.write(outPath, document);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
