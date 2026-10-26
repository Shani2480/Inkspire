import * as THREE from "three"

/**
 * How a loaded model is placed in the viewer: centred on its own middle and, when its units are far from the
 * viewer's (a model made in centimetres or metres, as Word's are), scaled to the view. Null when there is nothing to
 * draw: no scene in the file, or a scene without extent. The viewer then keeps what it shows (the stand-in shape, or
 * Word's picture of a model from Word) instead of an empty view.
 */
export function fitLoadedModel(
  root: THREE.Object3D | null | undefined,
): { scale: number; centre: THREE.Vector3 } | null {
  if (!root) {
    return null
  }
  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) {
    return null
  }
  const size = box.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z)
  if (!(largest > 0)) {
    return null
  }
  return { scale: largest < 0.5 || largest > 4 ? 2 / largest : 1, centre: box.getCenter(new THREE.Vector3()) }
}
