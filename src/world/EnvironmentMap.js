import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let pmrem = null;

/** Image-based lighting for metallic surfaces and subtle ground reflections. */
export function applySceneEnvironment(scene, renderer) {
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, 0.04).texture;
  room.dispose?.();

  if (scene.environment) scene.environment.dispose();
  scene.environment = tex;
  scene.environmentIntensity = 0.85;
  return tex;
}

export function disposeEnvironment(scene) {
  if (scene.environment) {
    scene.environment.dispose();
    scene.environment = null;
  }
  pmrem?.dispose();
  pmrem = null;
}