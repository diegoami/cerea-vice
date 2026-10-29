import {Material,ShaderChunk} from 'three';
/** Per-world clones keep the shared legacy caches untouched. True radial fog
 * agrees with the circular streaming halo, including off-axis/mirror views. */
export class TileMaterials {
 private clones=new Map<Material,Material>();
 use(source:Material):Material {
  let result=source.userData.shared?this.clones.get(source):source;
  if(!result){result=source.clone();result.userData.shared=true;this.clones.set(source,result);}
  if(!result.userData.radialTileFog){
   result.userData.radialTileFog=true;
   result.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vTileFogPosition;\n'+shader.vertexShader.replace('#include <fog_vertex>','#include <fog_vertex>\nvTileFogPosition=mvPosition.xyz;');
    shader.fragmentShader='varying vec3 vTileFogPosition;\n'+shader.fragmentShader.replace('#include <fog_fragment>',ShaderChunk.fog_fragment.replaceAll('vFogDepth','length(vTileFogPosition)'));
   };
   result.customProgramCacheKey=()=> 'tile-radial-fog-v1';
  }
  return result;
 }
 /** Drop this world's copy of a shared material that has been freed. */
 release(source:Material){const clone=this.clones.get(source);if(clone){clone.dispose();this.clones.delete(source);}}
 dispose(){for(const material of this.clones.values())material.dispose();this.clones.clear();}
}
