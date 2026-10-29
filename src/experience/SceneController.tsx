import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import {
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  Material,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { BusinessHealthCore } from './BusinessHealthCore'
import { CustomerNetwork } from './CustomerNetwork'
import { InventoryWorld } from './InventoryWorld'
import { PriorityBriefingLayer } from './PriorityBriefingLayer'
import { RevenueLandscape } from './RevenueLandscape'
import type { ExperienceSceneProps } from './types'

interface SceneControllerProps extends ExperienceSceneProps {
  progressRef: MutableRefObject<number>
  pointerActiveRef: MutableRefObject<boolean>
  active: boolean
  reducedMotion: boolean
  compact: boolean
}

interface FadingMaterial {
  material: Material
  opacity: number
  transparent: boolean
  depthWrite: boolean
}

interface RiskNode {
  node: Object3D
  origin: Vector3
}

interface SceneObjectState {
  object: Object3D
  raycast: Object3D['raycast']
  castShadow: boolean
}

const revenueLightColor = new Color('#6DA5FF')
const inventoryLightColor = new Color('#8FD8EE')
const disabledRaycast: Object3D['raycast'] = () => undefined

function smoothstep(start: number, end: number, value: number) {
  const normalized = MathUtils.clamp((value - start) / (end - start), 0, 1)
  return normalized * normalized * (3 - 2 * normalized)
}

function collectMaterials(group: Group | null) {
  const records: FadingMaterial[] = []
  const seen = new Set<Material>()

  group?.traverse((object) => {
    const candidate = (object as Object3D & { material?: Material | Material[] }).material
    if (!candidate) return
    const materials = Array.isArray(candidate) ? candidate : [candidate]
    materials.forEach((material) => {
      if (seen.has(material)) return
      seen.add(material)
      records.push({
        material,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      })
      material.transparent = true
    })
  })

  return records
}

function fadeGroup(group: Group | null, materials: FadingMaterial[], visibility: number) {
  if (!group) return
  const weight = MathUtils.clamp(visibility, 0, 1)
  group.visible = weight > 0.002
  materials.forEach((record) => {
    record.material.opacity = record.opacity * weight
    const transparent = record.transparent || weight < 0.999
    if (record.material.transparent !== transparent) {
      record.material.transparent = transparent
      record.material.needsUpdate = true
    }
    record.material.depthWrite = record.depthWrite && weight > 0.985
  })
}

function collectSceneObjects(group: Group | null) {
  const records: SceneObjectState[] = []
  group?.traverse((object) => {
    records.push({
      object,
      raycast: object.raycast,
      castShadow: object.castShadow,
    })
  })
  return records
}

function setSceneActivity(records: SceneObjectState[], interactive: boolean, castsShadow: boolean) {
  records.forEach((record) => {
    record.object.raycast = interactive ? record.raycast : disabledRaycast
    record.object.castShadow = record.castShadow && castsShadow
  })
}

function restoreMaterials(groups: readonly FadingMaterial[][]) {
  groups.flat().forEach((record) => {
    record.material.opacity = record.opacity
    record.material.transparent = record.transparent
    record.material.depthWrite = record.depthWrite
  })
}

function restoreSceneObjects(groups: readonly SceneObjectState[][]) {
  groups.flat().forEach((record) => {
    record.object.raycast = record.raycast
    record.object.castShadow = record.castShadow
  })
}

export function SceneController({
  progressRef,
  pointerActiveRef,
  active,
  reducedMotion,
  compact,
  onSelectSystem,
  onSelectCustomer,
  onSelectInventory,
}: SceneControllerProps) {
  const healthRef = useRef<Group>(null)
  const revenueRef = useRef<Group>(null)
  const customerRef = useRef<Group>(null)
  const inventoryRef = useRef<Group>(null)
  const briefingRef = useRef<Group>(null)
  const keyLightRef = useRef<DirectionalLight>(null)
  const sceneMaterials = useRef<FadingMaterial[][]>([[], [], [], [], []])
  const sceneObjects = useRef<SceneObjectState[][]>([[], [], [], [], []])
  const dominantSceneRef = useRef(0)
  const highRiskNodes = useRef<RiskNode[]>([])
  const criticalBeacon = useRef<Object3D | null>(null)
  const coreDots = useRef<Object3D | null>(null)
  const smoothedProgress = useRef(MathUtils.clamp(progressRef.current || 0, 0, 1))
  const cameraGoal = useRef(new Vector3())
  const targetGoal = useRef(new Vector3())
  const currentTarget = useRef(new Vector3(0, 0, 0))
  const lightColor = useRef(new Color())
  const invalidate = useThree((state) => state.invalidate)

  const cameraPath = useMemo(() => new CatmullRomCurve3([
    new Vector3(0, 0.65, 8.7),
    new Vector3(0.25, 1.15, 7.65),
    new Vector3(-0.35, 3.4, 9.2),
    new Vector3(0.2, 1.05, 9.45),
    new Vector3(5.9, 5.15, 7.5),
    new Vector3(0.35, 3.25, 9.25),
  ], false, 'catmullrom', 0.32), [])

  const targetPath = useMemo(() => new CatmullRomCurve3([
    new Vector3(0, 0.05, 0),
    new Vector3(0, 0, 0),
    new Vector3(0, 0.15, 0),
    new Vector3(0, 0, -0.15),
    new Vector3(0, -0.15, 0),
    new Vector3(0, -0.1, 0),
  ], false, 'catmullrom', 0.32), [])

  useLayoutEffect(() => {
    const groups = [
      healthRef.current,
      revenueRef.current,
      customerRef.current,
      inventoryRef.current,
      briefingRef.current,
    ]
    sceneMaterials.current = groups.map(collectMaterials)
    sceneObjects.current = groups.map(collectSceneObjects)
    highRiskNodes.current = customerRef.current
      ?.getObjectsByProperty('name', 'high-risk-customer')
      .map((node) => ({ node, origin: node.position.clone() })) ?? []
    criticalBeacon.current = inventoryRef.current?.getObjectByName('smart-pos-critical-beacon') ?? null
    coreDots.current = healthRef.current?.getObjectByName('atlasyn-core-dots') ?? null

    fadeGroup(healthRef.current, sceneMaterials.current[0], 1)
    fadeGroup(revenueRef.current, sceneMaterials.current[1], 0)
    fadeGroup(customerRef.current, sceneMaterials.current[2], 0)
    fadeGroup(inventoryRef.current, sceneMaterials.current[3], 0)
    fadeGroup(briefingRef.current, sceneMaterials.current[4], 0)
    sceneObjects.current.forEach((records, index) => setSceneActivity(records, index === 0, index === 0 && !compact))
    dominantSceneRef.current = 0
    invalidate()

    return () => {
      restoreMaterials(sceneMaterials.current)
      restoreSceneObjects(sceneObjects.current)
    }
  }, [compact, invalidate])

  useFrame(({ camera, clock, pointer, size }, delta) => {
    const rawProgress = Number.isFinite(progressRef.current)
      ? MathUtils.clamp(progressRef.current, 0, 1)
      : 0
    const frameDelta = Math.min(delta, 0.1)
    const shouldEase = active && !reducedMotion
    smoothedProgress.current = shouldEase
      ? MathUtils.damp(smoothedProgress.current, rawProgress, 5.5, frameDelta)
      : rawProgress
    const progress = smoothedProgress.current

    const revenueTransition = smoothstep(0.18, 0.3, progress)
    const customerTransition = smoothstep(0.45, 0.58, progress)
    const inventoryTransition = smoothstep(0.68, 0.78, progress)
    const briefingTransition = smoothstep(0.78, 0.9, progress)
    const healthWeight = 1 - revenueTransition
    const revenueWeight = revenueTransition * (1 - customerTransition)
    const customerWeight = customerTransition * (1 - inventoryTransition)
    const inventoryWeight = inventoryTransition * (1 - briefingTransition)
    const briefingWeight = briefingTransition
    const weights = [healthWeight, revenueWeight, customerWeight, inventoryWeight, briefingWeight]
    let dominantScene = 0
    for (let index = 1; index < weights.length; index += 1) {
      if (weights[index] > weights[dominantScene]) dominantScene = index
    }

    fadeGroup(healthRef.current, sceneMaterials.current[0], healthWeight)
    fadeGroup(revenueRef.current, sceneMaterials.current[1], revenueWeight)
    fadeGroup(customerRef.current, sceneMaterials.current[2], customerWeight)
    fadeGroup(inventoryRef.current, sceneMaterials.current[3], inventoryWeight)
    fadeGroup(briefingRef.current, sceneMaterials.current[4], briefingWeight)
    if (dominantSceneRef.current !== dominantScene) {
      sceneObjects.current.forEach((records, index) => {
        setSceneActivity(records, index === dominantScene, index === dominantScene && !compact)
      })
      dominantSceneRef.current = dominantScene
    }

    if (healthRef.current) {
      const scale = 1 - revenueTransition * 0.38
      healthRef.current.scale.setScalar(scale)
      healthRef.current.position.z = -revenueTransition * 1.2
      healthRef.current.rotation.y = progress * 0.32
        + (shouldEase ? clock.elapsedTime * 0.018 : 0)
    }
    if (revenueRef.current) {
      const scale = 0.72 + revenueTransition * 0.28 - customerTransition * 0.08
      revenueRef.current.scale.setScalar(scale)
      revenueRef.current.position.set(0, -0.08, MathUtils.lerp(1.4, -0.8, revenueTransition))
      revenueRef.current.rotation.y = MathUtils.lerp(-0.12, 0.04, revenueTransition)
    }
    if (customerRef.current) {
      const scale = 0.7 + customerTransition * 0.3 - inventoryTransition * 0.08
      customerRef.current.scale.setScalar(scale)
      customerRef.current.position.z = MathUtils.lerp(1.35, -0.75, customerTransition)
      customerRef.current.rotation.y = MathUtils.lerp(0.2, -0.04, customerTransition)
    }
    if (inventoryRef.current) {
      const scale = 0.7 + inventoryTransition * 0.3
      inventoryRef.current.scale.setScalar(scale)
      inventoryRef.current.position.y = MathUtils.lerp(-0.65, 0, inventoryTransition)
      inventoryRef.current.rotation.y = MathUtils.lerp(-0.22, 0, inventoryTransition)
    }
    if (briefingRef.current) {
      const scale = 0.72 + briefingTransition * 0.28
      briefingRef.current.scale.setScalar(scale)
      briefingRef.current.position.set(0, MathUtils.lerp(-0.4, 0, briefingTransition), MathUtils.lerp(1.1, 0, briefingTransition))
      briefingRef.current.rotation.y = MathUtils.lerp(0.16, 0, briefingTransition)
    }

    highRiskNodes.current.forEach(({ node, origin }, index) => {
      const separation = 0.78 + customerTransition * 0.22
      const signal = shouldEase ? Math.sin(clock.elapsedTime * 0.45 + index) * 0.006 : 0
      node.position.copy(origin).multiplyScalar(separation + signal)
    })
    if (criticalBeacon.current) {
      const pulse = shouldEase ? 1 + Math.sin(clock.elapsedTime * 1.8) * 0.045 : 1
      criticalBeacon.current.scale.setScalar(pulse)
    }
    if (coreDots.current) {
      coreDots.current.rotation.z = shouldEase ? clock.elapsedTime * 0.08 : 0
    }

    cameraPath.getPointAt(progress, cameraGoal.current)
    targetPath.getPointAt(progress, targetGoal.current)
    const parallaxFactor = compact ? 0.55 : 1
    const pointerEnabled = shouldEase && pointerActiveRef.current
    const parallaxX = pointerEnabled ? pointer.x * 0.16 * parallaxFactor : 0
    const parallaxY = pointerEnabled ? pointer.y * 0.1 * parallaxFactor : 0
    cameraGoal.current.x += parallaxX
    cameraGoal.current.y += parallaxY
    targetGoal.current.x += parallaxX * 0.18
    targetGoal.current.y += parallaxY * 0.12
    const aspect = size.width / Math.max(size.height, 1)
    const narrowFraming = compact
      ? 1 + MathUtils.clamp((1.18 - aspect) * 0.62, 0, 0.34)
      : 1
    cameraGoal.current
      .sub(targetGoal.current)
      .multiplyScalar(narrowFraming)
      .add(targetGoal.current)

    const cameraDelta = shouldEase ? frameDelta : 1
    const cameraDamping = shouldEase ? 4.6 : 30
    camera.position.x = MathUtils.damp(camera.position.x, cameraGoal.current.x, cameraDamping, cameraDelta)
    camera.position.y = MathUtils.damp(camera.position.y, cameraGoal.current.y, cameraDamping, cameraDelta)
    camera.position.z = MathUtils.damp(camera.position.z, cameraGoal.current.z, cameraDamping, cameraDelta)
    currentTarget.current.x = MathUtils.damp(currentTarget.current.x, targetGoal.current.x, cameraDamping, cameraDelta)
    currentTarget.current.y = MathUtils.damp(currentTarget.current.y, targetGoal.current.y, cameraDamping, cameraDelta)
    currentTarget.current.z = MathUtils.damp(currentTarget.current.z, targetGoal.current.z, cameraDamping, cameraDelta)
    camera.lookAt(currentTarget.current)

    if (camera instanceof PerspectiveCamera) {
      const desiredFov = size.width < 700 ? 48 : size.width < 1100 ? 42 : 37
      const nextFov = MathUtils.damp(camera.fov, desiredFov, 8, frameDelta)
      if (Math.abs(nextFov - camera.fov) > 0.001) {
        camera.fov = nextFov
        camera.updateProjectionMatrix()
      }
    }

    if (keyLightRef.current) {
      lightColor.current.lerpColors(revenueLightColor, inventoryLightColor, inventoryTransition)
      keyLightRef.current.color.copy(lightColor.current)
      keyLightRef.current.intensity = MathUtils.lerp(2.1, 2.55, inventoryTransition)
    }
  })

  return (
    <>
      <fog attach="fog" args={['#031522', 8, 24]} />
      <ambientLight intensity={0.32} color="#CDEEFF" />
      <hemisphereLight intensity={0.7} color="#DDF8FF" groundColor="#012039" />
      <directionalLight
        ref={keyLightRef}
        castShadow
        color="#6DA5FF"
        intensity={2.1}
        position={[4.5, 7, 6]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={24}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0002}
      />
      <pointLight color="#03B6ED" intensity={10} distance={7} decay={2} position={[-3, 1.5, 3]} />

      <group ref={healthRef}>
      <BusinessHealthCore onSelectSystem={onSelectSystem} compact={compact} />
      </group>
      <group ref={revenueRef} visible={false}>
        <RevenueLandscape onSelectSystem={onSelectSystem} />
      </group>
      <group ref={customerRef} visible={false}>
        <CustomerNetwork
          onSelectCustomer={onSelectCustomer}
          onSelectSystem={onSelectSystem}
          compact={compact}
        />
      </group>
      <group ref={inventoryRef} visible={false}>
        <InventoryWorld onSelectInventory={onSelectInventory} onSelectSystem={onSelectSystem} />
      </group>
      <group ref={briefingRef} visible={false}>
        <PriorityBriefingLayer
          onSelectSystem={onSelectSystem}
          onSelectCustomer={onSelectCustomer}
          onSelectInventory={onSelectInventory}
        />
      </group>
    </>
  )
}
