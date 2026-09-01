import * as THREE from "three";
import { OBJLoader, MTLLoader, GLTFExporter } from "three-stdlib";

const IMAGE_RE = /\.(png|jpe?g|webp|bmp|gif|tga)$/i;

/** Source unit the OBJ's raw coordinates are authored in. OBJ carries no unit,
 *  so it must be chosen (or auto-guessed) at import — a 32-unit RH chair is 32
 *  INCHES (0.82 m), while a 32-unit value could equally be 32 cm. */
export type ModelUnit = "auto" | "mm" | "cm" | "m" | "inch";

export const UNIT_LABELS: Record<ModelUnit, string> = {
  auto: "Avtomatik",
  mm: "Millimetr (mm)",
  cm: "Santimetr (sm)",
  m: "Metr (m)",
  inch: "Dyuym (inch)",
};

const UNIT_TO_M: Record<Exclude<ModelUnit, "auto">, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  inch: 0.0254,
};

export interface ConvertedModel {
  file: File;
  /** Real-world bounding size baked into the GLB, metres. */
  sizeM: { w: number; h: number; d: number };
}

/** Guess a metres-per-unit factor from the raw bounding box — mirrors
 *  extractSceneInfo's heuristic so "Avtomatik" matches what the studio would
 *  have auto-detected (mm >1000, cm >10, feet 5–10, else metres). */
function autoScaleFactor(maxDim: number): number {
  return maxDim > 1000 ? 0.001 : maxDim > 10 ? 0.01 : maxDim >= 5 ? 0.3048 : 1;
}

/** Strip any path so `maps\\Wood7.jpg` and `./Wood7.jpg` both match `Wood7.jpg`. */
function basename(path: string): string {
  const clean = path.split(/[\\/]/).pop() ?? path;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/**
 * Convert an OBJ model (plus its optional `.mtl` and texture images) into a
 * single, self-contained binary glTF (`.glb`) entirely in the browser, with
 * its real-world scale **baked in** so it renders at the right size.
 *
 * OBJ is a multi-file format: the `.obj` references a `.mtl`, which references
 * external texture images by relative path. Our whole 3-D pipeline (upload,
 * preview, studio renderer) is GLB-only because GLB bundles mesh + materials +
 * textures into one file. Rather than teach every stage to juggle OBJ's loose
 * files, we bundle them here at pick-time and hand the rest of the app a GLB.
 *
 * OBJ files carry no unit, and the studio's auto-detection can't tell inches
 * from centimetres for a mid-range value (a 32-unit RH chair is inches → 0.82 m,
 * not cm → 0.32 m). So the caller picks the source unit; we scale the geometry
 * into metres before export, and the studio's autoScale then reads it back as
 * ~1 — no guessing at render time.
 */
export async function objFilesToGlb(files: File[], unit: ModelUnit = "auto"): Promise<ConvertedModel> {
  const objFile = files.find((f) => f.name.toLowerCase().endsWith(".obj"));
  if (!objFile) throw new Error("OBJ fayl tanlanmagan");
  const mtlFile = files.find((f) => f.name.toLowerCase().endsWith(".mtl"));
  const imageFiles = files.filter((f) => IMAGE_RE.test(f.name));

  // Map every companion file's base name → blob URL so the loaders can resolve
  // the relative references inside the .obj / .mtl.
  const urlByName = new Map<string, string>();
  for (const f of imageFiles) urlByName.set(basename(f.name), URL.createObjectURL(f));

  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => urlByName.get(basename(url)) ?? url);

  try {
    let materials: ReturnType<MTLLoader["parse"]> | undefined;
    if (mtlFile) {
      const mtlText = await mtlFile.text();
      materials = new MTLLoader(manager).parse(mtlText, "");

      // preload() kicks off texture loads through the manager; wait for them to
      // finish so the exporter embeds real image data, not empty textures.
      let anyPending = false;
      const texturesDone = new Promise<void>((resolve) => {
        manager.onLoad = () => resolve();
      });
      manager.onStart = () => {
        anyPending = true;
      };
      manager.onError = (url) => console.warn("[objToGlb] texture failed:", url);
      materials.preload();
      if (anyPending) await texturesDone;
    }

    const objText = await objFile.text();
    const objLoader = new OBJLoader(manager);
    if (materials) objLoader.setMaterials(materials);
    const object = objLoader.parse(objText);

    // Scale raw OBJ units into metres. A single root-node scale is enough —
    // GLTFExporter writes it as the node transform and extractSceneInfo reads
    // it back via world-space bounds.
    const rawSize = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
    const toM = unit === "auto" ? autoScaleFactor(maxDim) : UNIT_TO_M[unit];
    object.scale.setScalar(toM);
    object.updateMatrixWorld(true);

    const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      new GLTFExporter().parse(
        object,
        (result) => resolve(result as ArrayBuffer),
        (err) => reject(err instanceof Error ? err : new Error("GLB eksport qilib bo'lmadi")),
        { binary: true },
      );
    });

    const glbName = objFile.name.replace(/\.obj$/i, "") + ".glb";
    return {
      file: new File([glbBuffer], glbName, { type: "model/gltf-binary" }),
      sizeM: {
        w: parseFloat((rawSize.x * toM).toFixed(2)),
        h: parseFloat((rawSize.y * toM).toFixed(2)),
        d: parseFloat((rawSize.z * toM).toFixed(2)),
      },
    };
  } finally {
    for (const url of urlByName.values()) URL.revokeObjectURL(url);
  }
}
