"""Blender headless USDZ → GLB converter.

Run as:  blender -b --python tools/usdz_to_glb.py -- <in.usdz> <out.glb>

Kept tiny and dependency-free (only `bpy`, provided by Blender) so it can run in
a slim Blender-only image. It imports the RoomPlan-exported parametric USDZ and
re-exports it as a single GLB for the studio's optional "Skan ko'rinishi"
reference overlay. It is best-effort: the studio never needs the GLB (it builds
the room from the parametric data), so any failure just leaves glb_path null.
"""
import sys

import bpy


def main() -> int:
    argv = sys.argv
    if "--" not in argv:
        print("usage: blender -b --python usdz_to_glb.py -- <in.usdz> <out.glb>")
        return 2
    args = argv[argv.index("--") + 1:]
    if len(args) < 2:
        print("need <in.usdz> <out.glb>")
        return 2
    src, dst = args[0], args[1]

    # Empty scene so nothing from the default file leaks into the export.
    bpy.ops.wm.read_factory_settings(use_empty=True)

    # Blender's USD importer handles .usdz (zipped USD) in 3.x+.
    bpy.ops.wm.usd_import(filepath=src)

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
    )
    print(f"usdz_to_glb: wrote {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
