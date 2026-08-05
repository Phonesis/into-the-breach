let unitStatusMarkersVisible = true;

export function areUnitStatusMarkersVisible() {
  return unitStatusMarkersVisible;
}

export function setUnitStatusMarkersVisible(visible) {
  unitStatusMarkersVisible = !!visible;
  return unitStatusMarkersVisible;
}
