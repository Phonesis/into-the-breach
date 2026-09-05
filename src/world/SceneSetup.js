import * as THREE from 'three';
import { getBattlefieldLighting, getBattlefieldSunDirection } from './BattlefieldLighting.js';
import { applySceneEnvironment } from './EnvironmentMap.js';

const SKY_VERT = `
varying vec3 vSkyDirection;
void main() {
  vSkyDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunPower;
varying vec3 vSkyDirection;
void main() {
  vec3 dir = normalize(vSkyDirection);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uTop, pow(h, 0.72));
  float sunDot = max(dot(dir, uSunDir), 0.0);
  float sun = pow(sunDot, uSunPower);
  float halo = pow(sunDot, 12.0) * 0.35;
  vec3 col = sky + uSunColor * (sun * 1.15 + halo);
  float horizonGlow = exp(-abs(dir.y) * 6.0) * 0.12;
  col += uHorizon * horizonGlow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
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
  const profile = getBattlefieldLighting(mapDef);
  const sky = new THREE.Color(mapDef.skyColor ?? 0x6b7d8f).lerp(new THREE.Color(profile.sky), 0.2);
  const fog = new THREE.Color(mapDef.fogColor ?? 0x8a9aaa);
  const horizon = sky.clone().lerp(fog, 0.55);
  const top = sky.clone().lerp(new THREE.Color(0x4a6a9a), 0.35);
  const mapSize = mapDef.size ?? 140;
  const skyRadius = skyRadiusForMap(mapSize);

  scene.background = horizon.clone();
  const fogDensity = (mapDef.fogDensity ?? 0.0052) * Math.min(1, 150 / Math.max(mapSize, 150));
  scene.fog = new THREE.FogExp2(fog.getHex(), fogDensity);
  if (renderer) renderer.setClearColor(horizon, 1);

  disposeSceneEnvironment(scene);

  if (renderer) applySceneEnvironment(scene, renderer, mapDef);
  const skyGroup = createSkyDome(top, horizon, skyRadius, profile);
  skyGroup.name = 'sky';
  skyGroup.userData.skyRadius = skyRadius;
  scene.add(skyGroup);
  scene.userData.skyGroup = skyGroup;

  addMapSkyBorder(scene, horizon, fog, sky, mapDef.groundColor ?? fog.getHex(), mapSize);

  return { skyGroup, fogColor: fog, sunDir: getBattlefieldSunDirection() };
}

/** Keep the sky dome centered on the camera so edges of large maps still show sky. */
export function updateSkyForCamera(scene, x, z) {
  const sky = scene.userData.skyGroup ?? scene.getObjectByName('sky');
  if (sky && !scene.userData.skyGroup) scene.userData.skyGroup = sky;
  if (sky) sky.position.set(x, 0, z);
}

export function disposeSceneEnvironment(scene) {
  for (const name of ['sky', 'mapBorder']) {
    const group = scene.getObjectByName(name);
    if (!group) continue;
    group.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    scene.remove(group);
    if (name === 'sky') scene.userData.skyGroup = null;
  }
}

function createSkyDome(topColor, horizonColor, radius, profile) {
  const group = new THREE.Group();
  // A full dome covers low camera angles too; a cut hemisphere exposed a
  // straight band of the clear color below its rim.
  const geo = new THREE.SphereGeometry(radius, 64, 32);
  const uniforms = {
    uTop: { value: topColor },
    uHorizon: { value: horizonColor },
    uSunDir: { value: getBattlefieldSunDirection() },
    uSunColor: { value: new THREE.Color(profile.sun).multiplyScalar(1 - profile.haze * 0.55) },
    uSunPower: { value: 1600 },
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
        // Fade the far edge into the actual sky, avoiding an opaque
        // horizontal seam where the finite backdrop ring ends.
        gl_FragColor = vec4(col, edgeSoft * (1.0 - smoothstep(0.72, 1.0, t)));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
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

  scene.add(group);
}

export function setupLighting(scene, mapDef = null) {
  const profile = getBattlefieldLighting(mapDef);
  const hemi = new THREE.HemisphereLight(profile.sky, profile.ground, profile.skyIntensity + 0.18);
  scene.add(hemi);

  const amb = new THREE.AmbientLight(profile.sky, 0.08);
  scene.add(amb);

  const sun = new THREE.DirectionalLight(profile.sun, profile.sunIntensity);
  sun.position.set(-58, 82, 44);
  sun.userData.shadowOffset = sun.position.clone();
  sun.castShadow = true;
  const urbanShadow = mapDef?.terrain === 'urban';
  // Berlin's dense caster count makes an oversized 176 m shadow footprint
  // disproportionately expensive. A tighter 144 m focus at 3072px retains
  // nearly the same world-space texel density while drawing substantially less.
  const shadowMapSize = urbanShadow ? 3072 : 4096;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 220;
  const s = urbanShadow ? 72 : 88;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  // The hemispherical sky and outdoor environment already supply diffuse
  // fill and reflected light. Extra studio-style rim/bounce directionals made
  // foliage look plastic and evaluated three additional PBR lights per pixel.
  return { sun, hemi };

}

/** Keep shadow focus on the active battlefield (console-style cascaded feel). */
export function updateLightingForTarget(lights, x, z) {
  if (!lights?.sun) return;
  const sun = lights.sun;
  const shadowCamera = sun.shadow.camera;
  const shadowWidth = shadowCamera.right - shadowCamera.left;
  const mapWidth = sun.shadow.mapSize.x || 4096;
  const texelWorldSize = shadowWidth / mapWidth;
  const snappedX = Math.round(x / texelWorldSize) * texelWorldSize;
  const snappedZ = Math.round(z / texelWorldSize) * texelWorldSize;
  if (
    sun.userData.shadowTargetX === snappedX &&
    sun.userData.shadowTargetZ === snappedZ
  ) {
    return;
  }
  sun.userData.shadowTargetX = snappedX;
  sun.userData.shadowTargetZ = snappedZ;
  const offset = sun.userData.shadowOffset ?? new THREE.Vector3(-58, 82, 44);

  // Move the light and target together so the shadow projection keeps a fixed
  // orientation. Texel snapping prevents rooftops from shimmering while the
  // camera pans by sub-pixel amounts.
  sun.target.position.set(snappedX, 0, snappedZ);
  sun.position.set(snappedX + offset.x, offset.y, snappedZ + offset.z);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}
