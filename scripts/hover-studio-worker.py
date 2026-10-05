import bpy, math
from mathutils import Vector
s=bpy.context.scene
def mat(name,color,metal=0,rough=.35,emission=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
 m.use_fake_user=True;return m
blue=mat('01 Racing blue',(.025,.22,.48),.65)
glass=mat('02 Dark canopy',(.012,.025,.06),.35,.19)
gold=mat('03 Gold trim',(.95,.47,.055),.55)
glow=mat('04 Engine glow',(.025,.65,1),.25,.2,3)
floor=mat('Studio navy',(.018,.035,.055),.25,.5)
bpy.ops.mesh.primitive_cylinder_add(vertices=96,radius=4.1,depth=.24,location=(0,0,-.22))
o=bpy.context.object;o.name='Studio platform';o.data.materials.append(floor)
b=o.modifiers.new('Soft edge','BEVEL');b.width=.10;b.segments=3
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.35))
o=bpy.context.object;o.name='Studio floor';o.data.materials.append(floor)
bpy.ops.object.camera_add(location=(8,-10,6))
cam=bpy.context.object;cam.name='Poster camera';cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=10.5;s.camera=cam
for name,loc,power,color in [('Key',(3,-4,7),1600,(.8,.91,1)),('Fill',(-4,-1,4),900,(.2,.65,1)),('Rim',(0,4,5),1900,(1,.55,.17))]:
 bpy.ops.object.light_add(type='POINT',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shadow_soft_size=2
s.world=bpy.data.worlds.new('Studio world');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.06,.08,.12,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.35
s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1280;s.render.resolution_y=800;s.render.resolution_percentage=100
s.render.image_settings.media_type='IMAGE';s.render.image_settings.file_format='PNG'
s.view_settings.view_transform='Khronos PBR Neutral'
for o in bpy.data.objects:o.hide_select=True
bpy.ops.object.select_all(action='DESELECT')
for sc in bpy.data.screens:
 for a in sc.areas:
  if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL'
s['lesson']='Atticus Day 29: studio only. Build the car yourself. No scripts required.'
result={'objects':[o.name for o in bpy.data.objects],'materials':[m.name for m in bpy.data.materials],'engine':s.render.engine}

