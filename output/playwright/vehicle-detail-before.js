import * as THREE from 'three';
import { buildTerrain, updateUnitTerrainPose } from '/.tmp-vehicle-detail-baseline/src/world/Terrain.js';
import { setupRenderer, setupSceneEnvironment, setupLighting } from '/.tmp-vehicle-detail-baseline/src/world/SceneSetup.js';
import { preloadUnitTextures, setActiveVehicleTheatre } from '/.tmp-vehicle-detail-baseline/src/units/UnitTextures.js';
import { createUnitMesh } from '/.tmp-vehicle-detail-baseline/src/units/UnitMeshes.js';
import { createGroundMaterialMaps } from '/.tmp-vehicle-detail-baseline/src/world/proceduralTextures.js';
import { MAPS } from '/.tmp-vehicle-detail-baseline/src/data/maps.js';
import { FACTIONS } from '/.tmp-vehicle-detail-baseline/src/data/factions.js';
const q=new URLSearchParams(location.search), progress=document.querySelector('#progress');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1280,720);document.body.append(renderer.domElement);setupRenderer(renderer);
const scene=new THREE.Scene();const map={...MAPS[q.get('theatre')||'normandy'],size:180,sizeScale:1.5};
await preloadUnitTextures();setActiveVehicleTheatre(map.id);
let start=performance.now();setupSceneEnvironment(scene,map,renderer);setupLighting(scene,map);const environmentMs=performance.now()-start;
start=performance.now();const terrain=buildTerrain(map,scene);const terrainMs=performance.now()-start;
const count=Number(q.get('count')||100); const kind=q.get('kind')||'mixed';const models=[];
const types=kind==='vehicles'?['tank','tankDestroyer','superHeavyTank','truck','armoredCar','artillery','antiTankGun']:['infantry','infantry','infantry','machineGun','mortar','tank','tankDestroyer','superHeavyTank','truck','armoredCar'];
start=performance.now();
for(let i=0;i<count;i++){const faction=Object.values(FACTIONS)[i%5],type=q.get('type')||types[i%types.length],model=createUnitMesh(type,faction.color,faction.accent,faction.id);model.position.set((i%10-4.5)*7.5,0,(Math.floor(i/10)-4.5)*7.5);if(q.has('look'))model.position.set((i%3-1)*6,0,(Math.floor(i/3)-.5)*8);model.rotation.y=(i%3-1)*.2;updateUnitTerrainPose({mesh:model,def:{type}},map,2);scene.add(model);models.push(model);}
const modelsMs=performance.now()-start;
const camera=new THREE.PerspectiveCamera(46,1280/720,.1,1000);camera.position.set(55,78,96);camera.lookAt(0,0,0);if(q.has('look')){camera.position.set(12,10,19);camera.lookAt(0,1,0);}if(q.has('hero')){camera.position.set(-1,7,6);camera.lookAt(-6,2,-4);}
start=performance.now();renderer.compile(scene,camera);const compileMs=performance.now()-start;
let frames=0,last=0;const timings=[],cpu=[];
const result=await new Promise(resolve=>{function tick(now){const t=performance.now();renderer.render(scene,camera);const cost=performance.now()-t;if(frames>=45){timings.push(now-last);cpu.push(cost);}last=now;frames++;if(frames<165)requestAnimationFrame(tick);else{timings.sort((a,b)=>a-b);cpu.sort((a,b)=>a-b);resolve({phase:'before',theatre:map.id,kind,units:count,viewport:[1280,720],pixelRatio:1,frames:timings.length,fps:1000/(timings.reduce((a,b)=>a+b)/timings.length),medianFrameMs:timings[Math.floor(timings.length*.5)],p95FrameMs:timings[Math.floor(timings.length*.95)],medianSubmitMs:cpu[Math.floor(cpu.length*.5)],p95SubmitMs:cpu[Math.floor(cpu.length*.95)],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometryBuffers:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length,environmentMs,terrainMs,modelsMs,compileMs});}}requestAnimationFrame(tick);});
progress.textContent=JSON.stringify(result,null,2);progress.id='results';window.benchmarkResult=result;
const download=document.createElement('a');download.href=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));download.download='graphics-'+result.phase+'-'+map.id+'-'+kind+'.json';download.textContent='Download measurements';document.body.append(download);
