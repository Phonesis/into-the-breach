import * as THREE from 'three';

const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunPower;
varying vec3 vWorld;
void main() {
  vec3 dir = normalize(vWorld);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uTop, pow(h, 0.72));
  float sunDot = max(dot(dir, uSunDir), 0.0);
  float sun = pow(sunDot, uSunPower);
  float halo = pow(sunDot, 12.0) * 0.35;
  vec3 col = sky + uSunColor * (sun * 1.15 + halo);
  float horizonGlow = exp(-abs(dir.y) * 6.0) * 0.12;
  col += uHorizon * horizonGlow;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function setupRenderer(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

function skyRadiusForMap(mapSize) {
  return Math.max(420, (mapSize ?? 140) * 2.2);
}

export function setupSceneEnvironment(scene, mapDef, renderer) {
  const sky = new THREE.Color(mapDef.skyColor ?? 0x6b7d8f);
  const fog = new THREE.Color(mapDef.fogColor ?? 0x8a9aaa);
  const horizon = sky.clone().lerp(fog, 0.55);
  const top = sky.clone().lerp(new THREE.Color(0x4a6a9a), 0.35);
  const mapSize = mapDef.size ?? 140;
  const skyRadius = skyRadiusForMap(mapSize);

  scene.background = horizon.clone();
  scene.fog = new THREE.FogExp2(fog.getHex(), mapDef.fogDensity ?? 0.0052);
  if (renderer) renderer.setClearColor(horizon, 1);

  disposeSceneEnvironment(scene);

  const skyGroup = createSkyDome(top, horizon, skyRadius);
  skyGroup.name = 'sky';
  skyGroup.userData.skyRadius = skyRadius;
  scene.add(skyGroup);

  addMapSkyBorder(scene, horizon, fog, sky, mapDef.groundColor ?? fog.getHex(), mapSize);
  addCloudLayers(scene, mapDef, sky, fog, mapSize, skyRadius);

  return { skyGroup, fogColor: fog, sunDir: new THREE.Vector3(-0.55, 0.62, 0.42).normalize() };
}

/** Keep the sky dome centered on the camera so edges of large maps still show sky. */
export function updateSkyForCamera(scene, x, z) {
  const sky = scene.getObjectByName('sky');
  if (sky) sky.position.set(x, 0, z);
}

export function disposeSceneEnvironment(scene) {
  for (const name of ['sky', 'mapBorder', 'cloudLayers']) {
    const group = scene.getObjectByName(name);
    if (!group) continue;
    group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    scene.remove(group);
  }
}

function createSkyDome(topColor, horizonColor, radius) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const uniforms = {
    uTop: { value: topColor },
    uHorizon: { value: horizonColor },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.42).normalize() },
    uSunColor: { value: new THREE.Color(0xfff0d0) },
    uSunPower: { value: 128 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -3;
  group.add(dome);

  const sunScale = radius / 280;
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(10 * sunScale, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.55, fog: false })
  );
  sunCore.position.set(-72 * sunScale, 68 * sunScale, 48 * sunScale);
  group.add(sunCore);

  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(22 * sunScale, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe4b8, transparent: true, opacity: 0.14, fog: false })
  );
  sunHalo.position.copy(sunCore.position);
  group.add(sunHalo);

  group.userData.skyUniforms = uniforms;
  return group;
}

/** Map-anchored backdrop beyond the playable terrain — fades ground into sky at the theater edge. */
function addMapSkyBorder(scene, horizonColor, fogColor, skyColor, groundHex, mapSize) {
  const group = new THREE.Group();
  group.name = 'mapBorder';

  const half = mapSize * 0.5;
  const inner = Math.max(half - 10, half * 0.92);
  const outer = half + Math.max(180, mapSize * 0.85);
  const groundColor = new THREE.Color(groundHex);
  const skyTint = skyColor.clone().lerp(new THREE.Color(0x9ec8e8), 0.42);

  const ringGeo = new THREE.RingGeometry(inner, outer, 128, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: inner },
      uOuter: { value: outer },
      uGround: { value: groundColor },
      uFog: { value: fogColor },
      uHorizon: { value: horizonColor },
      uSky: { value: skyTint },
    },
    vertexShader: `
      varying vec2 vXZ;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vXZ = w.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uInner;
      uniform float uOuter;
      uniform vec3 uGround;
      uniform vec3 uFog;
      uniform vec3 uHorizon;
      uniform vec3 uSky;
      varying vec2 vXZ;
      void main() {
        float r = length(vXZ);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        vec3 nearCol = mix(uGround, uFog, 0.35);
        vec3 midCol = mix(nearCol, uHorizon, smoothstep(0.0, 0.42, t));
        vec3 col = mix(midCol, uSky, smoothstep(0.38, 1.0, pow(t, 0.82)));
        float edgeSoft = smoothstep(uInner, uInner + 6.0, r);
        gl_FragColor = vec4(col, edgeSoft);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = -0.9;
  ring.renderOrder = -2;
  ring.name = 'horizonRing';
  group.add(ring);

  addMapEdgeVeils(group, groundColor, fogColor, horizonColor, skyTint, mapSize, half, outer);

  scene.add(group);
}

function addMapEdgeVeils(group, groundColor, fogColor, horizonColor, skyTint, mapSize, half, extent) {
  const veilW = mapSize + (extent - half) * 2 + 48;
  const veilH = 148;
  const geo = new THREE.PlaneGeometry(veilW, veilH, 1, 10);
  const colors = [];
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i);
    const t = THREE.MathUtils.clamp((y + veilH * 0.5) / veilH, 0, 1);
    const c = groundColor
      .clone()
      .lerp(fogColor, Math.pow(t, 0.45) * 0.55)
      .lerp(horizonColor, Math.pow(t, 0.72))
      .lerp(skyTint, Math.pow(t, 2.1));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
  });

  const inset = 0.6;
  const placements = [
    { x: 0, z: half + inset, ry: Math.PI },
    { x: 0, z: -half - inset, ry: 0 },
    { x: half + inset, z: 0, ry: -Math.PI / 2 },
    { x: -half - inset, z: 0, ry: Math.PI / 2 },
  ];

  for (const p of placements) {
    const veil = new THREE.Mesh(geo.clone(), mat.clone());
    veil.position.set(p.x, veilH * 0.46, p.z);
    veil.rotation.y = p.ry;
    veil.renderOrder = -2;
    group.add(veil);
  }
}

function hashMapSeed(mapDef) {
  const key = `${mapDef?.id ?? 'map'}:${mapDef?.size ?? 140}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h || 1;
}

function createMapRng(mapDef) {
  let seed = hashMapSeed(mapDef);
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** World-anchored horizon clouds on the map rim — never parented to the camera-following sky. */
function addCloudLayers(scene, mapDef, skyColor, fogColor, mapSize, skyRadius) {
  const rng = createMapRng(mapDef);
  const group = new THREE.Group();
  group.name = 'cloudLayers';

  const cloudColor = new THREE.Color(skyColor).lerp(new THREE.Color(0xffffff), 0.62);
  const heightScale = skyRadius / 420;
  const half = mapSize * 0.5;
  const innerRing = half * 0.68;
  const outerRing = half * 0.92;

  const cloudMat = new THREE.MeshStandardMaterial({
    color: cloudColor,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    depthTest: true,
    fog: true,
    roughness: 1,
    metalness: 0,
    emissive: cloudColor,
    emissiveIntensity: 0.05,
  });

  const count = 7;
  for (let i = 0; i < count; i++) {
    const puff = new THREE.Group();
    puff.userData.isCloudLayer = true;
    const w = 12 + rng() * 12;
    for (let p = 0; p < 3; p++) {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(w * (0.32 + rng() * 0.22), 8, 6),
        cloudMat
      );
      blob.position.set((rng() - 0.5) * w, (rng() - 0.5) * 1.5, (rng() - 0.5) * w * 0.5);
      blob.scale.set(1.2 + rng() * 0.5, 0.18 + rng() * 0.08, 0.9 + rng() * 0.35);
      puff.add(blob);
    }

    const angle = (i / count) * Math.PI * 2 + rng() * 0.55;
    const dist = innerRing + rng() * (outerRing - innerRing);
    puff.position.set(
      Math.cos(angle) * dist,
      (112 + rng() * 14) * heightScale,
      Math.sin(angle) * dist
    );
    puff.scale.setScalar(1.05 + rng() * 0.25);
    puff.renderOrder = -5;
    group.add(puff);
  }

  scene.add(group);
}

export function setupLighting(scene) {
  const hemi = new THREE.HemisphereLight(0xb8d4ff, 0x3d5230, 0.55);
  scene.add(hemi);

  const amb = new THREE.AmbientLight(0x8a9ab8, 0.22);
  scene.add(amb);

  const sun = new THREE.DirectionalLight(0xfff0dc, 1.85);
  sun.position.set(-58, 82, 44);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  const s = 88;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  const fill = new THREE.DirectionalLight(0x7098c8, 0.48);
  fill.position.set(52, 38, -58);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffc890, 0.28);
  rim.position.set(35, 28, 65);
  scene.add(rim);

  const bounce = new THREE.DirectionalLight(0x6a8a5a, 0.15);
  bounce.position.set(0, 12, -40);
  scene.add(bounce);

  return { sun, hemi, fill, rim };
}

/** Keep shadow focus on the active battlefield (console-style cascaded feel). */
export function updateLightingForTarget(lights, x, z) {
  if (!lights?.sun) return;
  lights.sun.target.position.set(x, 0, z);
  lights.sun.target.updateMatrixWorld();
  lights.sun.shadow.camera.position.copy(lights.sun.position);
  lights.sun.shadow.camera.lookAt(lights.sun.target.position);
  lights.sun.shadow.camera.updateProjectionMatrix();
}