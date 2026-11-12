"""Generate the .glb variants this test scene compares, from a single source model.

Run from the scene folder, with Blender 3.x/4.x:

    blender --background --python tools/make_variants.py

Input:
    models/LampostSmall.glb

Output:
    models/dupes/LampostSmall_01.glb ... _14.glb   14 near-identical, byte-DIFFERENT copies
    models/LampostRow_Separate.glb                 one file, 14 separate objects (not joined)
    models/LampostRow_Merged.glb                   one file, all meshes joined (Ctrl-J)

Why the dupes must differ in bytes: a deployed scene addresses every file by the
hash of its content, so 14 byte-identical copies collapse to one entry and the
client dedups them exactly like the shared case. Renaming the objects, meshes and
materials per copy is enough to make each file genuinely distinct. (Local scene
development hashes by path instead, so plain copies would look distinct there and
identical once deployed -- this script keeps both paths honest.)

The grid offsets below are duplicated in src/config.ts so all four stations lay
their lamp posts out the same way.
"""

import os
import sys

import bpy
from mathutils import Vector

SCENE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(SCENE_DIR, "models")
DUPES_DIR = os.path.join(MODELS_DIR, "dupes")
SOURCE = os.path.join(MODELS_DIR, "LampostSmall.glb")

COPIES = 14
COLUMN_OFFSETS = [1.2, 3.6]
ROW_OFFSETS = [6, 9.5, 13, 16.5, 20, 23.5, 27]


def slot(index):
    """Scene-space (x, z) of copy `index`, matching slotPosition() in src/config.ts."""
    column = COLUMN_OFFSETS[index % len(COLUMN_OFFSETS)]
    row = ROW_OFFSETS[(index // len(COLUMN_OFFSETS)) % len(ROW_OFFSETS)]
    return column, row


def blender_offset(index):
    """Scene (x, z) -> Blender (x, y, z). Blender -Y maps to the scene's +Z."""
    column, row = slot(index)
    return Vector((column, -row, 0.0))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source():
    bpy.ops.import_scene.gltf(filepath=SOURCE)


def deselect_all():
    for obj in bpy.data.objects:
        obj.select_set(False)


def flatten_to_meshes():
    """Drop the importer's empty roots, keeping every mesh at its world transform."""
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if not meshes:
        sys.exit("no mesh objects found in %s" % SOURCE)

    deselect_all()
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    for obj in [obj for obj in bpy.data.objects if obj.type != "MESH"]:
        bpy.data.objects.remove(obj, do_unlink=True)

    deselect_all()
    return meshes


def is_collider(obj):
    """The engine treats any node whose name contains `_collider` as an invisible collider."""
    return "_collider" in obj.name.lower()


def join_into_one(objects, name):
    """Ctrl-J: everything ends up inside the first object, which keeps its material slots."""
    deselect_all()
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = name
    deselect_all()


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=False)
    print("wrote %s" % os.path.relpath(path, SCENE_DIR))


def make_dupes():
    """14 files that look the same and hash differently."""
    for index in range(COPIES):
        suffix = "%02d" % (index + 1)
        reset()
        import_source()

        for obj in bpy.data.objects:
            obj.name = "%s_%s" % (obj.name, suffix)
            if obj.data is not None:
                obj.data.name = "%s_%s" % (obj.data.name, suffix)
            for material_slot in obj.material_slots:
                if material_slot.material is not None:
                    material_slot.material.name = "%s_%s" % (material_slot.material.name, suffix)

        export(os.path.join(DUPES_DIR, "LampostSmall_%s.glb" % suffix))


def make_row(join_meshes, out_path, joined_name):
    """One file holding 14 lamp posts, either as separate objects or joined into one."""
    reset()
    import_source()
    base = flatten_to_meshes()
    origins = {obj: obj.location.copy() for obj in base}

    everything = []
    for index in range(COPIES):
        offset = blender_offset(index)
        if index == 0:
            for obj in base:
                obj.location = origins[obj] + offset
            everything.extend(base)
            continue

        for obj in base:
            copy = obj.copy()
            # Separate objects keep the shared mesh datablock, so the exported file
            # holds one mesh referenced 14 times. Joining needs its own copy.
            if join_meshes:
                copy.data = obj.data.copy()
            copy.location = origins[obj] + offset
            bpy.context.collection.objects.link(copy)
            everything.append(copy)

    if join_meshes:
        # Visible meshes and collider meshes are joined separately: welding a
        # material-less collider box into the render mesh would both draw the box
        # and add a third material slot.
        visible = [obj for obj in everything if not is_collider(obj)]
        colliders = [obj for obj in everything if is_collider(obj)]

        if visible:
            join_into_one(visible, joined_name)
        if colliders:
            join_into_one(colliders, "%s_collider" % joined_name)

    export(out_path)


def main():
    if not os.path.isfile(SOURCE):
        sys.exit("missing %s -- drop the lamp post model there first" % SOURCE)

    make_dupes()
    make_row(False, os.path.join(MODELS_DIR, "LampostRow_Separate.glb"), "LampostRow_Separate")
    make_row(True, os.path.join(MODELS_DIR, "LampostRow_Merged.glb"), "LampostRow_Merged")
    print("done -- %d dupes + 2 row models generated from %s" % (COPIES, os.path.basename(SOURCE)))


main()
