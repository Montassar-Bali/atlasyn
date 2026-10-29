import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { SceneController } from './SceneController'
import type { ExperienceCanvasProps } from './types'

function useDocumentVisibility() {
  const [visible, setVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ))

  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  return visible
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    query.addEventListener('change', updatePreference)
    return () => query.removeEventListener('change', updatePreference)
  }, [])

  return reducedMotion
}

function useCompactScene() {
  const [compact, setCompact] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1100px)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)')
    const updateTier = (event: MediaQueryListEvent) => setCompact(event.matches)
    query.addEventListener('change', updateTier)
    return () => query.removeEventListener('change', updateTier)
  }, [])

  return compact
}

export function ExperienceCanvas({
  progressRef,
  active = true,
  className,
  style,
  onSelectSystem,
  onSelectCustomer,
  onSelectInventory,
}: ExperienceCanvasProps) {
  const documentVisible = useDocumentVisibility()
  const reducedMotion = useReducedMotion()
  const compact = useCompactScene()
  const sceneActive = active && documentVisible
  const pointerActiveRef = useRef(false)

  return (
    <div
      aria-hidden="true"
      className={className}
      onPointerEnter={() => { pointerActiveRef.current = true }}
      onPointerLeave={(event) => {
        pointerActiveRef.current = false
        event.currentTarget.querySelector('canvas')?.style.setProperty('cursor', 'default')
      }}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'pan-y',
        ...style,
        pointerEvents: active ? style?.pointerEvents ?? 'auto' : 'none',
      }}
    >
      <Canvas
        aria-hidden="true"
        camera={{ position: [0, 0.65, 8.7], fov: 37, near: 0.1, far: 60 }}
        dpr={[1, compact ? 1.25 : 1.55]}
        frameloop={sceneActive ? 'always' : 'demand'}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance',
        }}
        shadows={!compact}
        onCreated={({ gl }) => {
          gl.domElement.setAttribute('aria-hidden', 'true')
          gl.outputColorSpace = SRGBColorSpace
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.02
          gl.setClearColor('#050816', 0)
        }}
      >
        <SceneController
          progressRef={progressRef}
          pointerActiveRef={pointerActiveRef}
          active={sceneActive}
          reducedMotion={reducedMotion}
          compact={compact}
          onSelectSystem={onSelectSystem}
          onSelectCustomer={onSelectCustomer}
          onSelectInventory={onSelectInventory}
        />
      </Canvas>
    </div>
  )
}

export default ExperienceCanvas
