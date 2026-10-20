/** Word's Play 3D scenes: how a 3D model moves while it plays. Pure, so the motion can be tested. */

export type ModelScene = "" | "turntable" | "swing" | "jump" | "arrive" | "leave" | "turn"

export const MODEL_SCENES: { id: Exclude<ModelScene, "">; label: string; description: string }[] = [
  { id: "turntable", label: "Turntable", description: "Turns the model around once, again and again." },
  { id: "swing", label: "Swing", description: "Swings the model from side to side." },
  { id: "jump", label: "Jump & Turn", description: "Jumps the model up while it turns." },
  { id: "arrive", label: "Arrive", description: "Brings the model in from a distance and settles it." },
  { id: "leave", label: "Leave", description: "Sends the model away into the distance." },
  { id: "turn", label: "Turn", description: "Turns the model once and stops." },
]

export function modelScene(value: unknown): ModelScene {
  return MODEL_SCENES.some((scene) => scene.id === value) ? (value as ModelScene) : ""
}

/** Seconds one pass of a scene takes. */
export const SCENE_SECONDS = 4

export type ScenePose = {
  /** Turn around the vertical axis, added to the model's own, in radians. */
  yaw: number
  /** Lift as a fraction of the model's height. */
  lift: number
  /** Scale; 1 is the size at rest. */
  scale: number
  /** Opacity, 0 to 1. */
  opacity: number
}

const REST: ScenePose = { yaw: 0, lift: 0, scale: 1, opacity: 1 }

/** The pose of `scene` after `seconds` of playing. One-shot scenes (arrive, leave, turn) hold their last pose. */
export function scenePose(scene: ModelScene, seconds: number): ScenePose {
  const progress = Math.min(1, Math.max(0, seconds / SCENE_SECONDS))
  const loop = (seconds % SCENE_SECONDS) / SCENE_SECONDS
  const ease = 1 - (1 - progress) ** 3
  switch (scene) {
    case "turntable":
      return { ...REST, yaw: loop * Math.PI * 2 }
    case "swing":
      return { ...REST, yaw: Math.sin(loop * Math.PI * 2) * 0.6 }
    case "jump":
      return { ...REST, yaw: loop * Math.PI * 2, lift: Math.abs(Math.sin(loop * Math.PI * 2)) * 0.35 }
    case "arrive":
      return { yaw: (1 - ease) * Math.PI, lift: 0, scale: 0.2 + 0.8 * ease, opacity: ease }
    case "leave":
      return { yaw: ease * Math.PI, lift: 0, scale: 1 - 0.8 * ease, opacity: 1 - ease }
    case "turn":
      return { ...REST, yaw: ease * Math.PI * 2 }
    default:
      return REST
  }
}
