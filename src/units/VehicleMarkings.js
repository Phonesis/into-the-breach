import * as THREE from 'three';
import { getActiveVehicleTheatre } from './UnitTextures.js';

// Representative wartime schemes, not claims of a specific regiment or vehicle.
// Exceptions and historical references: docs/vehicle-markings.md.
const WHITE = 0xe9e5d6, BLACK = 0x20221d, RED = 0xb8382b;
function rect(x,y,w,h) { return [x,y,x+w,y,x+w,y+h,x,y,x+w,y+h,x,y+h]; }
function star(radius) {
  const shape = new THREE.Shape();
  for (let i=0;i<10;i++) {
    const a=Math.PI/2+i*Math.PI/5, r=radius*(i%2 ? .382 : 1);
    if (!i) shape.moveTo(Math.cos(a)*r,Math.sin(a)*r);
    else shape.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  shape.closePath();
  const geo=new THREE.ShapeGeometry(shape).toNonIndexed(), p=geo.attributes.position, out=[];
  for(let i=0;i<p.count;i++)out.push(p.getX(i),p.getY(i));
  geo.dispose();return out;
}
function ring(radius, width, segments=32) {
  const out=[];
  for(let i=0;i<segments;i++) {
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,r=radius-width;
    out.push(Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*radius,Math.sin(a)*radius,Math.cos(b)*radius,Math.sin(b)*radius,
      Math.cos(a)*r,Math.sin(a)*r,Math.cos(b)*radius,Math.sin(b)*radius,Math.cos(b)*r,Math.sin(b)*r);
  }
  return out;
}
function cross(size) {
  const a=size/2,b=size*.15;
  return [...rect(-b,-a,2*b,2*a),...rect(-a,-b,a-b,2*b),...rect(b,-b,a-b,2*b)];
}
function line(x,y,a,b,w) {
  const length=Math.hypot(a-x,b-y),dx=-(b-y)/length*w/2,dy=(a-x)/length*w/2;
  return [x-dx,y-dy,a-dx,b-dy,a+dx,b+dy,x-dx,y-dy,a+dx,b+dy,x+dx,y+dy];
}
function whLetters() {
  return [...line(-.31,.05,-.29,-.05,.012),...line(-.29,-.05,-.26,.015,.012),
    ...line(-.26,.015,-.23,-.05,.012),...line(-.23,-.05,-.21,.05,.012),
    ...rect(-.185,-.05,.012,.1),...rect(-.13,-.05,.012,.1),...rect(-.185,-.006,.067,.012)];
}
function digits(text,height) {
  const strokes={0:'abcedf',1:'bc',2:'abged',3:'abgcd',4:'fgbc',5:'afgcd',6:'afgecd',7:'abc',8:'abcdefg',9:'abfgcd'};
  const out=[],w=height*.48,t=height*.09;
  [...text].forEach((c,i)=>{
    const x=(i-(text.length-1)/2)*height*.65-w/2,y=-height/2;
    const parts={a:[x,y+height-t,w,t],g:[x,y+height/2-t/2,w,t],d:[x,y,w,t],
      f:[x,y+height/2,t,height/2],b:[x+w-t,y+height/2,t,height/2],e:[x,y,t,height/2],c:[x+w-t,y,t,height/2]};
    for(const k of strokes[c]??'')out.push(...rect(...parts[k]));
  });return out;
}

/** Project each paint triangle onto actual armor, avoiding buried cylinder decals.
 * Geometry is built once, attached to its moving part and uses opaque vertex color
 * paint: no texture uploads, transparent sorting, or frame-time decal projection.
 */
function paint(parent, surfaces, triangles, color, center, facing, material, part, records, label) {
  const ray=new THREE.Raycaster(), normal=new THREE.Vector3(...facing), origin=new THREE.Vector3();
  const horizontal = Math.abs(normal.y)>.5;
  const front = Math.abs(normal.z)>.5;
  const points=[], colors=[];
  const tint=new THREE.Color(color);
  parent.updateWorldMatrix(true,true);
  const worldNormal=normal.clone().transformDirection(parent.matrixWorld);
  for(let i=0;i<triangles.length;i+=6) {
    const vertices=[];
    for(let j=0;j<6;j+=2) {
      const u=triangles[i+j],v=triangles[i+j+1];
      origin.set(center[0]+(horizontal||front?u:0),center[1]+(horizontal?0:v),center[2]+(horizontal?v:front?0:-u*normal.x));
      origin.addScaledVector(normal,8).applyMatrix4(parent.matrixWorld);
      ray.set(origin,worldNormal.clone().negate());
      const hit=ray.intersectObjects(surfaces,false)[0];
      if(!hit)break;
      const p=parent.worldToLocal(hit.point.clone().addScaledVector(worldNormal,.012));
      vertices.push(p.x,p.y,p.z);
    }
    if(vertices.length===9) {
      points.push(...vertices);
      for(let v=0;v<3;v++)colors.push(tint.r,tint.g,tint.b);
    }
  }
  if(!points.length)return;
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);mesh.userData.tankPart=part;
  mesh.receiveShadow=true;parent.add(mesh);
  records.push({label,part,triangles:points.length/9});
}

export function addVehicleMarkings(root,type,faction,d,body) {
  const records=root.userData.vehicleMarkings=[];
  // Towed guns were usually unmarked externally; avoid inventing large tank
  // recognition emblems on every gun shield merely for faction identification.
  if(type==='artillery'||type==='antiTankGun'||d.model==='blackPrince') {
    root.userData.vehicleMarkingScheme=d.model==='blackPrince'?'unmarked-prototype':'unmarked-towed-gun';return;
  }
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0,
    side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const surfaces=[];root.traverse(o=>{if(o.isMesh&&o.material===body)surfaces.push(o);});
  const turret=root.userData.turretPivot;
  const panel=d.turret??d.superstructure??d.cab??d.hull;
  const parent=type==='truck'?root:turret??root;
  const part=type==='truck'?'cab':turret?'turret':'hull';
  const sideSurfaces=surfaces.filter(o=>o.parent===parent&&o.userData.tankPart===part);
  const localZ=(panel.z??0)-(parent.position.z??0);
  const sideY=type==='truck'?d.cab.y-d.cab.h*.16:panel.y;
  const size=Math.min(.72,panel.h*(panel.style==='casemate'?.6:.85));
  const emit=(shape,color,center,facing,where=parent,targets=sideSurfaces,tag=part,label='recognition')=>
    paint(where,targets,shape,color,center,facing,material,tag,records,label);
  const sides=(shape,color,label)=>{for(const sign of [-1,1])emit(shape,color,[0,sideY,localZ],[sign,0,0],parent,sideSurfaces,part,label);};
  if(faction==='germany'&&type!=='truck') {
    // Balkenkreuz, the straight-bar wartime vehicle cross (not the modern cross).
    sides(cross(size),WHITE,'Balkenkreuz border');
    // Slightly inset center projected on top of the white paint, same draw batch.
    const blackSurfaces=parent.children.filter(o=>o.material===material);
    for(const sign of [-1,1])emit(cross(size*.73),BLACK,[0,sideY,localZ],[sign,0,0],parent,blackSurfaces,part,'Balkenkreuz center');
  } else if(faction==='usa') {
    sides(star(size*.52),WHITE,'US white star');
  } else if(faction==='russia'&&type!=='truck') {
    sides(digits('214',size*.72),WHITE,'Soviet tactical number');
  } else if(faction==='uk'&&d.model!=='blackPrince'&&type!=='truck') {
    const r=size*.42,t=size*.065;
    sides([...rect(-r,-r,2*r,t),...rect(-r,r-t,2*r,t),...rect(-r,-r,t,2*r),...rect(r-t,-r,t,2*r)],RED,'British squadron square');
  }
  if(faction==='usa'||(faction==='uk'&&d.model!=='blackPrince')) {
    const hood=d.hood;
    const closedTurret=!!d.turret&&!['openRound','openFaceted'].includes(d.turret.style);
    const topParent=closedTurret?turret:root;
    const topPanel=type==='truck'?(hood??d.cab):closedTurret?d.turret:d.hull;
    const topPart=type==='truck'?(hood?'hood':'cab'):closedTurret?'turret':'hull';
    const topTargets=surfaces.filter(o=>o.parent===topParent&&o.userData.tankPart===topPart);
    const z=type==='truck'?topPanel.z:closedTurret?(topPanel.z??0)-(topParent.position.z??0)+topPanel.d*.16:(d.hull.z??0)+d.hull.d*.3;
    const radius=Math.min(type==='truck'?.42:.48,topPanel.w*.32,topPanel.d*.25);
    const desert=getActiveVehicleTheatre()==='northAfrica';
    if(faction==='uk'&&desert) {
      emit(rect(-radius,-radius*.42,2*radius,radius*.84),WHITE,[0,0,z],[0,1,0],topParent,topTargets,topPart,'British recognition flash');
      emit(rect(-radius*.33,-radius*.42,radius*.66,radius*.84),RED,[0,.01,z],[0,1,0],topParent,topParent.children.filter(o=>o.material===material),topPart,'British recognition flash red');
    } else {
      emit([...star(radius*.78),...ring(radius,radius*.085)],WHITE,[0,0,z],[0,1,0],topParent,topTargets,topPart,'Allied aerial recognition star');
    }
  }
  if(faction==='japan') {
    const front=d.hood??d.glacis??d.hull;
    const tag=type==='truck'?'hood':'hull';
    const targets=surfaces.filter(o=>o.parent===root&&o.userData.tankPart===tag);
    emit(star(type==='truck'?.14:.13),0xd1b15e,[0,type==='truck'?front.y-.045:d.hull.y-.035,0],[0,0,1],root,targets,tag,'Imperial Japanese Army star');
  }
  if(type==='truck'&&(faction==='germany'||faction==='russia')) {
    // Small registration-style plate rather than an ahistorical giant national badge.
    const front=d.hood??d.cab, targets=surfaces.filter(o=>o.parent===root&&o.userData.tankPart==='hood');
    emit(rect(-.34,-.075,.68,.15),faction==='germany'?WHITE:BLACK,[0,front.y-.2,0],[0,0,1],root,targets,'hood','Registration plate');
    emit(faction==='germany'?[...whLetters(),...digits('21483',.105).map((v,i)=>i%2?v:v+.13)]:digits('214',.105),faction==='germany'?BLACK:WHITE,[0,front.y-.2,0],[0,0,1],root,root.children.filter(o=>o.material===material),'hood','Registration digits');
  }
  root.userData.vehicleMarkingScheme=d.model==='blackPrince'?'prototype':faction;
  if(!records.length)material.dispose();
}
