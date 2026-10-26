/**
 * Word's 3D Model Views (22.15): named angles, each a turn of the model away from facing the camera. Kept apart
 * from the viewer, which pulls in three.js, so the ribbon can list them without loading it.
 */
export type ModelView = { name: string; yaw: number; pitch: number }

const TURN = Math.PI / 2
const TILT = Math.PI / 6

export const MODEL_VIEWS: ModelView[] = [
  { name: "Front", yaw: 0, pitch: 0 },
  { name: "Back", yaw: Math.PI, pitch: 0 },
  { name: "Left", yaw: TURN, pitch: 0 },
  { name: "Right", yaw: -TURN, pitch: 0 },
  { name: "Top", yaw: 0, pitch: TURN },
  { name: "Bottom", yaw: 0, pitch: -TURN },
  { name: "Above Front Left", yaw: TURN / 2, pitch: TILT },
  { name: "Above Front Right", yaw: -TURN / 2, pitch: TILT },
  { name: "Above Back Left", yaw: Math.PI - TURN / 2, pitch: TILT },
  { name: "Above Back Right", yaw: Math.PI + TURN / 2, pitch: TILT },
  { name: "Below Front Left", yaw: TURN / 2, pitch: -TILT },
  { name: "Below Front Right", yaw: -TURN / 2, pitch: -TILT },
]

export type Pose = { yaw: number; pitch: number; roll: number }

/** Where the viewer's camera starts; used when no viewer is running to say where it is now. */
export const DEFAULT_CAMERA = { x: 2.2, y: 1.6, z: 2.4 }

type Matrix = number[][]

const turnY = (a: number): Matrix => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
]
const turnX = (a: number): Matrix => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
]
const turnZ = (a: number): Matrix => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
]
const times = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) => [0, 1, 2].map((column) => row.reduce((sum, value, k) => sum + value * b[k][column], 0)))

/** The model's turn as the viewer applies it: about the upright (`yaw`), then tipped (`pitch`), then rolled. */
export function poseMatrix(pose: Pose) {
  return times(times(turnY(pose.yaw), turnX(pose.pitch)), turnZ(pose.roll))
}

/** The pose of a turn, read back as the viewer's yaw, pitch and roll (three.js's "YXZ" order). */
export function matrixPose(m: Matrix): Pose {
  const pitch = Math.asin(-Math.min(1, Math.max(-1, m[1][2])))
  if (Math.abs(m[1][2]) < 0.9999999) {
    return { yaw: Math.atan2(m[0][2], m[2][2]), pitch, roll: Math.atan2(m[1][0], m[1][1]) }
  }
  return { yaw: Math.atan2(-m[2][0], m[0][0]), pitch, roll: 0 }
}

/** The model's turn that shows its front (+z) square and upright to a camera at this place, looking at the middle. */
export function facingPose(camera: { x: number; y: number; z: number }): Pose {
  return {
    yaw: Math.atan2(camera.x, camera.z),
    pitch: -Math.atan2(camera.y, Math.hypot(camera.x, camera.z)),
    roll: 0,
  }
}

/**
 * A named view as the model's turn for a camera at this place: the model is first turned in its own frame to bring
 * that side to the front, then the front is faced to the camera, so every side shows square and upright.
 */
export function viewPose(view: ModelView, camera = DEFAULT_CAMERA): Pose {
  const own = times(turnX(view.pitch), turnY(view.yaw))
  return matrixPose(times(poseMatrix(facingPose(camera)), own))
}

/** A running viewer, as the views gallery sees it: where its camera is, and the model drawn in each view. */
export type ViewSource = { camera: () => typeof DEFAULT_CAMERA; pictures: () => string[] | null }

const sources = new WeakMap<Element, ViewSource>()

export function registerViewSource(dom: Element, source: ViewSource | null) {
  if (source) {
    sources.set(dom, source)
  } else {
    sources.delete(dom)
  }
}

/** The viewer of the 3-D model whose node view is this element, if it has started. */
export function viewSourceFor(dom: Element | null | undefined) {
  return dom ? (sources.get(dom) ?? null) : null
}
