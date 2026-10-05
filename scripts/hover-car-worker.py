import bpy
s=bpy.context.scene
def render(name):
 t=artifacts.file(name=name,media_type='image/png');s.render.filepath=str(t.path);bpy.ops.render.render(write_still=True);t.publish()
def part(name,dim,loc,material):
 bpy.ops.mesh.primitive_cube_add(size=2,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 m=o.modifiers.new('Bevel','BEVEL');m.width=.1;m.segments=1
 o.data.materials.append(bpy.data.materials[material]);return o

part('Body',(3,4.4,.6),(0,0,1.1),'01 Racing blue')
part('Canopy',(1.8,2.1,.65),(0,.15,1.72),'02 Dark canopy')

for name,x,y in [('Front left',-1.65,-1.4),('Front right',1.65,-1.4),('Back left',-1.65,1.4),('Back right',1.65,1.4)]:
 part(name,(.65,1.35,.55),(x,y,.85),'03 Gold trim')
part('Rear wing',(3.8,.55,.18),(0,1.7,1.8),'03 Gold trim')
s.render.engine='CYCLES';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.resolution_x=960;s.render.resolution_y=600
render('hover-car-poster.png')
s.render.engine='BLENDER_EEVEE';s.eevee.taa_render_samples=16;s.eevee.use_raytracing=False
result={'parts':[{'name':o.name,'dimensions':list(o.dimensions),'location':list(o.location)} for o in bpy.data.objects if o.type=='MESH' and not o.name.startswith('Studio')],'student_parts':7,'rendered':True}

