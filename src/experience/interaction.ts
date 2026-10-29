import type { ThreeEvent } from '@react-three/fiber'
import { Vector3 } from 'three'

const hoverScaleKey = 'atlasynHoverScale'

function setCanvasCursor(event: ThreeEvent<PointerEvent>, cursor: string) {
  const target = event.nativeEvent.target
  if (target instanceof HTMLCanvasElement) target.style.cursor = cursor
}

export function showPointerAffordance(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation()
  setCanvasCursor(event, 'pointer')
  const storedScale = event.eventObject.userData[hoverScaleKey] as Vector3 | undefined
  const baseScale = storedScale ?? event.eventObject.scale.clone()
  event.eventObject.userData[hoverScaleKey] = baseScale
  event.eventObject.scale.copy(baseScale).multiplyScalar(1.035)
}

export function hidePointerAffordance(event: ThreeEvent<PointerEvent>) {
  event.stopPropagation()
  setCanvasCursor(event, 'default')
  const baseScale = event.eventObject.userData[hoverScaleKey] as Vector3 | undefined
  if (baseScale) event.eventObject.scale.copy(baseScale)
}
