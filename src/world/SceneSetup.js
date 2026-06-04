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

export function setupSceneEnvironment(scene, mapDef) {
  const sky = new THREE.Color(mapDef.skyColor ?? 0x6b7d8f);
  const fog = new THREE.Color(mapDef.fogColor ?? 0x8a9aaa);
  const horizon = sky.clone().lerp(fog, 0.55);
  const top = sky.clone().lerp(new THREE.Color(0x4a6a9a), 0.35);

  scene.background = null;
  scene.fog = new THREE.FogExp2(fog.getHex(), mapDef.fogDensity ?? 0.0052);

  disposeSceneEnvironment(scene);

  const skyGroup = createSkyDome(top, horizon);
  skyGroup.name = 'sky';
  scene.add(skyGroup);

  addCloudLayers(scene, sky, fog);

  return { skyGroup, fogColor: fog, sunDir: new THREE.Vector3(-0.55, 0.62, 0.42).normalize() };
}

export function disposeSceneEnvironment(scene) {
  const sky = scene.getObjectByName('sky');
  if (sky) {
    sky.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    scene.remove(sky);
  }
  for (let i = scene.children.length - 1; i >= 0; i--) {
    const c = scene.children[i];
    if (c.userData?.isCloudLayer) {
      c.geometry?.dispose();
      c.material?.dispose();
      scene.remove(c);
    }
  }
}

function createSkyDome(topColor, horizonColor) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(280, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.52);
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
  group.add(dome);

  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.55, fog: false })
  );
  sunCore.position.set(-72, 68, 48);
  group.add(sunCore);

  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(22, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe4b8, transparent: true, opacity: 0.14, fog: false })
  );
  sunHalo.position.copy(sunCore.position);
  group.add(sunHalo);

  group.userData.skyUniforms = uniforms;
  return group;
}

function addCloudLayers(scene, skyColor, fogColor) {
  const cloudColor = new THREE.Color(skyColor).lerp(new THREE.Color(0xffffff), 0.62);
  const mistColor = fogColor.clone().lerp(cloudColor, 0.4);

  const layers = [
    { count: 5, y: 52, scale: 1.4, opacity: 0.28, color: cloudColor },
    { count: 4, y: 38, scale: 1.8, opacity: 0.18, color: mistColor },
  ];

  for (const layer of layers) {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: layer.color,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      fog: false,
      roughness: 1,
      metalness: 0,
      emissive: layer.color,
      emissiveIntensity: 0.08,
    });

    for (let i = 0; i < layer.count; i++) {
      const puff = new THREE.Group();
      puff.userData.isCloudLayer = true;
      const w = 14 + Math.random() * 16;
      for (let p = 0; p < 4; p++) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(w * (0.35 + Math.random() * 0.25), 10, 8), cloudMat);
        blob.position.set((Math.random() - 0.5) * w, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * w * 0.6);
        blob.scale.set(1.4 + Math.random(), 0.28 + Math.random() * 0.15, 1 + Math.random() * 0.4);
        puff.add(blob);
      }
      puff.position.set((Math.random() - 0.5) * 130, layer.y + Math.random() * 12, (Math.random() - 0.5) * 130);
      puff.scale.setScalar(layer.scale);
      scene.add(puff);
    }
  }
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