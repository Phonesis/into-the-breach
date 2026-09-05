import * as THREE from 'three';
import {buildTerrain} from '/src/world/Terrain.js';
import {setupRenderer,setupSceneEnvironment,setupLighting} from '/src/world/SceneSetup.js';
import {addExplosionCrater} from '/.tmp-graphics-perf-baseline/src/world/TerrainDamage.js';
import {MAPS} from '/src/data/maps.js';
const q=new URLSearchParams(location.search),map={...MAPS[q.get('map')||'normandy'],size:140,sizeScale:1};
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(1280,660);setupRenderer(renderer);document.body.append(renderer.domElement);
const scene=new THREE.Scene(),terrain=buildTerrain(map,scene);
for(const child of [...scene.children])if(child!==terrain.ground)scene.remove(child);
setupSceneEnvironment(scene,map,renderer);setupLighting(scene,map);
const start=performance.now(),entries=[];
for(let row=0;row<2;row++)for(let col=0;col<3;col++){
 const x=(col-1)*11,z=(row-.5)*12,tier=['light','medium','heavy'][col];
 for(let j=0;j<(row?4:1);j++)entries.push(addExplosionCrater(scene,map,x+j*.22,z+j*.16,tier,terrain.ground,{minGap:0}));
}
const generationMs=performance.now()-start;
const camera=new THREE.PerspectiveCamera(46,1280/660,.1,1000);camera.position.set(16,28,32);camera.lookAt(0,0,0);
let frames=0;function render(){renderer.render(scene,camera);if(++frames<15)requestAnimationFrame(render);else{
 let heightSignature=0;const p=terrain.ground.geometry.attributes.position;for(let i=0;i<p.count;i++)heightSignature+=(i+1)*p.getY(i);
 const maps=[...new Set(entries.flatMap(e=>e.meshes.map(m=>m.material.map)))];
 const centers=maps.map(t=>Array.from(t.image.getContext('2d').getImageData(128,128,1,1).data));
 document.querySelector('#status').textContent=JSON.stringify({phase:'before',map:map.id,craters:entries.length,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,generationMs,heightSignature,centers});
}}requestAnimationFrame(render);
