import * as THREE from 'three';
import { captureRendererState, restoreRendererState } from '../effects/RendererState.js';
import { getBattlefieldLighting, getBattlefieldSunDirection } from './BattlefieldLighting.js';

const environments = new WeakMap();

/** Outdoor image-based light, generated once per theatre, including a warm
 * ground bounce and broad sky reflections instead of indoor light panels. */
export function applySceneEnvironment(scene, renderer, mapDef = null) {
  const profile = getBattlefieldLighting(mapDef);
  const current = environments.get(scene);
  if (current?.renderer === renderer && current.profile === profile) {
    scene.environment = current.target.texture;
    scene.environmentIntensity = profile.environmentIntensity;
    return scene.environment;
  }

  const width = 256;
  const height = 128;
  const pixels = new Float32Array(width * height * 4);
  const sky = new THREE.Color(profile.sky);
  const ground = new THREE.Color(profile.ground);
  const horizon = sky.clone().lerp(new THREE.Color(0xf2eadb), 0.42);
  const sun = new THREE.Color(profile.sun);
  const sunDir = getBattlefieldSunDirection();
  const color = new THREE.Color();
  const dir = new THREE.Vector3();
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI;
    const up = Math.sin(latitude);
    const radial = Math.cos(latitude);
    for (let x = 0; x < width; x++) {
      const longitude = ((x + 0.5) / width - 0.5) * Math.PI * 2;
      dir.set(radial * Math.cos(longitude), up, radial * Math.sin(longitude));
      if (up >= 0) {
        color.copy(horizon).lerp(sky, Math.pow(up, 0.45));
        color.multiplyScalar(0.9 + up * 0.45);
      } else {
        color.copy(horizon).multiplyScalar(0.65).lerp(ground, Math.pow(-up, 0.35));
        color.multiplyScalar(0.65);
      }
      const alignment = Math.max(0, dir.dot(sunDir));
      // Broad daylight lobe survives the small source resolution without a
      // glittering one-pixel sun. Direct shadows come from the main light.
      const daylight = Math.pow(alignment, 128) * (1.2 - profile.haze * 0.5)
        + Math.pow(alignment, 12) * 0.18;
      const offset = (y * width + x) * 4;
      pixels[offset] = color.r + sun.r * daylight;
      pixels[offset + 1] = color.g + sun.g * daylight;
      pixels[offset + 2] = color.b + sun.b * daylight;
      pixels[offset + 3] = 1;
    }
  }

  const source = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.FloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.LinearSRGBColorSpace;
  source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  let target;
  const rendererState = captureRendererState(renderer);
  try {
    target = generator.fromEquirectangular(source);
  } finally {
    source.dispose();
    generator.dispose();
    restoreRendererState(renderer, rendererState);
  }
  current?.target.dispose();
  environments.set(scene, { target, renderer, profile });
  scene.environment = target.texture;
  scene.environmentIntensity = profile.environmentIntensity;
  return target.texture;
}

export function disposeEnvironment(scene) {
  const current = environments.get(scene);
  current?.target.dispose();
  environments.delete(scene);
  scene.environment = null;
}
