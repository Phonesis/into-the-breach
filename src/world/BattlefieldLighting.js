import * as THREE from 'three';

// One outdoor palette drives direct light, sky and reflected light. Values are
// deliberately restrained so camouflage stays readable in both sun and shade.
const PROFILES = {
  bocage: { sky: 0xa7bed3, ground: 0x625e4a, sun: 0xfff2df, sunIntensity: 2.15, skyIntensity: 0.62, environmentIntensity: 0.58, haze: 0.65 },
  desert: { sky: 0x9dbfdf, ground: 0xb89b72, sun: 0xffe6bf, sunIntensity: 2.65, skyIntensity: 0.48, environmentIntensity: 0.55, haze: 0.2 },
  steppe: { sky: 0xb0c6da, ground: 0x82775a, sun: 0xffedce, sunIntensity: 2.35, skyIntensity: 0.55, environmentIntensity: 0.56, haze: 0.4 },
  hills: { sky: 0xaebdcc, ground: 0x78715b, sun: 0xffebd6, sunIntensity: 2.1, skyIntensity: 0.6, environmentIntensity: 0.58, haze: 0.55 },
  jungle: { sky: 0xb5c9cd, ground: 0x535340, sun: 0xffedce, sunIntensity: 1.95, skyIntensity: 0.65, environmentIntensity: 0.54, haze: 0.75 },
  urban: { sky: 0xb3bec8, ground: 0x77716a, sun: 0xffead7, sunIntensity: 2.05, skyIntensity: 0.6, environmentIntensity: 0.58, haze: 0.7 },
};

export function getBattlefieldLighting(mapDef = null) {
  return PROFILES[mapDef?.terrain] ?? PROFILES.bocage;
}

export function getBattlefieldSunDirection() {
  return new THREE.Vector3(-58, 82, 44).normalize();
}
