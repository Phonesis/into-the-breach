import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom'});
try {
 const {buildFactionVehicle,mat}=await server.ssrLoadModule('/src/units/FactionMeshes.js');
 const {batchVehicleParts}=await server.ssrLoadModule('/src/units/VehicleBatching.js');
 const {setActiveVehicleTheatre}=await server.ssrLoadModule('/src/units/UnitTextures.js');
 for(const theatre of ['normandy','northAfrica']) {
 setActiveVehicleTheatre(theatre);
 for(const faction of ['germany','usa','uk','russia','japan'])for(const type of ['tank','tankDestroyer','superHeavyTank','armoredCar','truck','artillery','antiTankGun']) {
  const root=new THREE.Group();buildFactionVehicle(root,type,faction,mat(0x58614a),mat(0x77745b),mat(0x222222));
  const records=root.userData.vehicleMarkings;
  if(['artillery','antiTankGun'].includes(type)||(faction==='uk'&&type==='superHeavyTank'))assert.equal(records.length,0);
  else assert.ok(records.length>0,`${faction} ${type} has visible paint geometry`);
  root.traverse(o=>{if(o.isMesh)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
  for(const record of records) {
    const expected={'Balkenkreuz border':6,'Balkenkreuz center':6,'US white star':8,'Imperial Japanese Army star':8,'Allied aerial recognition star':72,'British squadron square':8,'Soviet tactical number':22}[record.label];
    if(expected)assert.equal(record.triangles,expected,`${faction} ${type}: complete ${record.label}`);
  }
  if(faction==='usa'||(faction==='uk'&&type!=='superHeavyTank'&&!['artillery','antiTankGun'].includes(type))) {
    if(!['artillery','antiTankGun'].includes(type))assert.ok(records.some(r=>r.label===(faction==='uk'&&theatre==='northAfrica'?'British recognition flash':'Allied aerial recognition star')),`${faction} ${type}: aerial recognition present`);
  }
  const before=records.reduce((s,r)=>s+r.triangles,0);
  batchVehicleParts(root);
  let after=0;root.traverse(o=>{if(o.isMesh&&o.material.vertexColors)after+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  assert.equal(after,before,`${faction} ${type}: paint retained by batching`);
  console.log(theatre,faction,type,records.map(r=>r.label).join(', '),before);
 }
 }
} finally {await server.close();}
