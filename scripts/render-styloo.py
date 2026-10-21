"""Bake Styloo's CC0 GLBs into transparent sprites, without changing the art.

blender --background --python-exit-code 1 --python scripts/render-styloo.py -- <ChibiCharacters> <output> [character]
Requires Blender 5.1+. Uses the artist's emission materials as recommended.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
source, output = Path(args[0]).resolve(), Path(args[1]).resolve()
characters = args[2:] or ["ninja", "knight", "merchant", "archer", "student"]

def pose(name):
    # The first two models put the same animation prefix at the end.
    names = {f"anim_{name}", f"{name}anim_"}
    ranges = []
    for obj in bpy.context.scene.objects:
        data = obj.animation_data
        if data:
            data.action = None
            for track in data.nla_tracks:
                track.mute = track.name not in names
                if not track.mute:
                    ranges.extend((strip.frame_start, strip.frame_end) for strip in track.strips)
    if not ranges:
        raise RuntimeError(f"Missing animation: {name}")
    return min(start for start, end in ranges), max(end for start, end in ranges)

for character in characters:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source / "glb emission" / f"{character}.glb"))
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 288
    scene.render.resolution_y = 356
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("No environment lighting")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0
    start, end = pose("iddle")
    scene.frame_set(int(start))
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # glTF import creates an untextured Icosphere as a bone display helper.
    # It is not character geometry and must not expand the camera framing.
    points = [obj.matrix_world @ vertex.co
              for obj in scene.objects if obj.type == "MESH" and obj.material_slots
              for vertex in obj.evaluated_get(depsgraph).data.vertices]
    low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
    height = high.z - low.z
    center = (low + high) / 2
    camera_data = bpy.data.cameras.new("Avatar camera")
    camera = bpy.data.objects.new("Avatar camera", camera_data)
    scene.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = height * 1.22
    target = Vector((center.x, center.y, low.z + height * 0.50))
    camera.location = target + Vector((height * 0.65, -height * 3, height * 0.5))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    destination = output / character
    destination.mkdir(parents=True, exist_ok=True)
    print("AVATAR", character, "bounds", tuple(low), tuple(high), flush=True)
    scene.render.filepath = str(destination / "idle.png")
    bpy.ops.render.render(write_still=True)
    start, end = pose("walk")
    for index in range(8):
        frame = start + (end - start) * index / 8
        scene.frame_set(int(frame), subframe=frame % 1)
        scene.render.filepath = str(destination / f"walk-{index}.png")
        bpy.ops.render.render(write_still=True)
