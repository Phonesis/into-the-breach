import * as THREE from 'three';
import { setupRenderer, setupSceneEnvironment, setupLighting } from '/src/world/SceneSetup.js';
import { MAPS } from '/src/data/maps.js';
import { createUnitMesh } from '/src/units/UnitMeshes.js';
import { preloadUnitTextures, setActiveVehicleTheatre } from '/src/units/UnitTextures.js';
const q=new URLSearchParams(location.search), faction=q.get('faction')||'germany', type=q.get('type');
for(const f of ['germany','usa','uk','russia','japan']){const a=document.createElement('a');a.href='?faction='+f+(type?'&type='+type:'');a.textContent=f;document.querySelector('#nav').append(a);}
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,720,false);renderer.setPixelRatio(1);document.body.append(renderer.domElement);setupRenderer(renderer);
const scene=new THREE.Scene();setupSceneEnvironment(scene,MAPS.normandy,renderer);setupLighting(scene,MAPS.normandy);
const plane=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x626a54,roughness:1}));plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;scene.add(plane);
await preloadUnitTextures();setActiveVehicleTheatre('normandy');
const types=type?[type]:['tank','tankDestroyer','superHeavyTank','armoredCar','truck'];const records=[];
for(let i=0;i<types.length;i++){const m=createUnitMesh(types[i],0x596349,0xc8b58b,faction);m.position.set((i-(types.length-1)/2)*5.5,0,0);m.rotation.y=q.has('front')?.3:-.7;scene.add(m);records.push({type:types[i],markings:m.userData.vehicleMarkings});}
const camera=new THREE.PerspectiveCamera(42,1280/720,.1,200);camera.position.set(type?5:2,type?4:13,type?7:22);camera.lookAt(0,.65,0);
renderer.render(scene,camera);document.querySelector('#results').textContent=JSON.stringify({faction,draws:renderer.info.render.calls,records});
