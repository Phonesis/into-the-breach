import * as THREE from 'three';

/** Capture renderer state that an offscreen warm-up render can temporarily change. */
export function captureRendererState(renderer) {
  if (!renderer) return null;

  const state = {
    renderTarget: renderer.getRenderTarget?.() ?? null,
    activeCubeFace: renderer.getActiveCubeFace?.() ?? 0,
    activeMipmapLevel: renderer.getActiveMipmapLevel?.() ?? 0,
    viewport: new THREE.Vector4(),
    scissor: new THREE.Vector4(),
    scissorTest: renderer.getScissorTest?.() ?? false,
    clearColor: new THREE.Color(),
    clearAlpha: renderer.getClearAlpha?.() ?? 1,
    autoClear: renderer.autoClear,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    outputColorSpace: renderer.outputColorSpace,
  };

  renderer.getViewport?.(state.viewport);
  renderer.getScissor?.(state.scissor);
  renderer.getClearColor?.(state.clearColor);
  return state;
}

/** Restore the state captured before a temporary renderer warm-up. */
export function restoreRendererState(renderer, state) {
  if (!renderer || !state) return;

  renderer.setRenderTarget?.(
    state.renderTarget,
    state.activeCubeFace,
    state.activeMipmapLevel
  );
  renderer.setViewport?.(state.viewport);
  renderer.setScissor?.(state.scissor);
  renderer.setScissorTest?.(state.scissorTest);
  renderer.setClearColor?.(state.clearColor, state.clearAlpha);
  renderer.autoClear = state.autoClear;
  renderer.toneMapping = state.toneMapping;
  renderer.toneMappingExposure = state.toneMappingExposure;
  renderer.outputColorSpace = state.outputColorSpace;
}
