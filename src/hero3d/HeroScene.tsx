import { Canvas, useFrame } from '@react-three/fiber'
import {
  ContactShadows,
  Environment,
  Float,
  Lightformer,
  RoundedBox,
  Sparkles,
  useAnimations,
  useGLTF,
} from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ACESFilmicToneMapping,
  AnimationAction,
  Bone,
  Euler,
  Group,
  LoopOnce,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
} from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

const MODEL_URL = '/models/atlasyn-avatar.glb'

/** Short one-shot animations the avatar plays when poked. */
const EMOTES = ['ThumbsUp', 'Yes', 'Jump', 'Wave'] as const

type HeroSceneProps = {
  /** Changing this makes the avatar nod, so it reacts to selections elsewhere on the page. */
  reactKey: number
  onEmote?: (name: string) => void
}

/** Atlasyn palette applied over the model's original material slots. */
function brandMaterials(): Record<string, MeshPhysicalMaterial> {
  return {
    Main: new MeshPhysicalMaterial({ color: '#6B5BFF', roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.45, iridescenceIOR: 1.5 }),
    Grey: new MeshPhysicalMaterial({ color: '#F6F4FF', roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.2 }),
    Black: new MeshPhysicalMaterial({ color: '#16163F', roughness: 0.25, metalness: 0.3, clearcoat: 1, emissive: '#12C2E9', emissiveIntensity: 0.08 }),
  }
}

function Avatar({ reactKey, onEmote }: HeroSceneProps) {
  const root = useRef<Group>(null)
  const { scene, animations } = useGLTF(MODEL_URL)
  // Clone so remounts (page switches) never share a skeleton with a disposed instance.
  const model = useMemo(() => cloneSkinned(scene), [scene])
  const { actions, mixer } = useAnimations(animations, root)
  const head = useRef<Bone | null>(null)
  const current = useRef<AnimationAction | null>(null)
  const hover = useRef(false)

  useEffect(() => {
    const materials = brandMaterials()
    model.traverse((child) => {
      const mesh = child as Mesh
      if (mesh.isMesh) {
        // Remember the model's original slot so re-runs (StrictMode, remounts) still map to the brand material.
        mesh.userData.slot ??= (mesh.material as { name?: string }).name ?? ''
        const material = materials[mesh.userData.slot as string]
        if (material) mesh.material = material
        mesh.castShadow = true
      }
      if ((child as Bone).isBone && child.name === 'Head' && !head.current) head.current = child as Bone
    })
    return () => Object.values(materials).forEach((material) => material.dispose())
  }, [model])

  function fadeTo(name: string, once = false) {
    const next = actions[name]
    if (!next) return
    next.reset()
    if (once) { next.setLoop(LoopOnce, 1); next.clampWhenFinished = true }
    if (current.current && current.current !== next) current.current.fadeOut(0.35)
    next.fadeIn(0.35).play()
    current.current = next
  }

  function emote(name: string) {
    fadeTo(name, true)
    onEmote?.(name)
  }

  // Greet with a wave, then settle into idle after every one-shot emote.
  useEffect(() => {
    fadeTo('Wave', true)
    onEmote?.('Wave')
    const backToIdle = () => fadeTo('Idle')
    mixer.addEventListener('finished', backToIdle)
    return () => mixer.removeEventListener('finished', backToIdle)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, mixer])

  const firstReact = useRef(true)
  useEffect(() => {
    if (firstReact.current) { firstReact.current = false; return }
    emote('Yes')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reactKey])

  const look = useRef({ x: 0, y: 0 })
  const headBase = useRef(new Quaternion())
  const headLast = useRef<Quaternion | null>(null)
  const headOffset = useRef({ q: new Quaternion(), e: new Euler() })
  useFrame(({ pointer }, delta) => {
    // Runs after the mixer update, so these offsets layer on top of the animated pose.
    look.current.x = MathUtils.damp(look.current.x, pointer.x, 4, delta)
    look.current.y = MathUtils.damp(look.current.y, pointer.y, 4, delta)
    const h = head.current
    if (h) {
      // Only take a fresh base pose when the mixer wrote one; otherwise reuse it so offsets never accumulate.
      if (!headLast.current || !h.quaternion.equals(headLast.current)) headBase.current.copy(h.quaternion)
      const { q, e } = headOffset.current
      q.setFromEuler(e.set(-look.current.y * 0.3, look.current.x * 0.55, 0))
      h.quaternion.copy(headBase.current).multiply(q)
      headLast.current = (headLast.current ?? new Quaternion()).copy(h.quaternion)
    }
    if (root.current) {
      root.current.rotation.y = MathUtils.damp(root.current.rotation.y, look.current.x * 0.45, 3, delta)
      root.current.scale.setScalar(MathUtils.damp(root.current.scale.x, hover.current ? 0.64 : 0.6, 6, delta))
    }
  })

  return (
    <group
      ref={root}
      position={[0, -2.25, 0]}
      scale={0.6}
      onClick={(event) => { event.stopPropagation(); emote(EMOTES[Math.floor(Math.random() * EMOTES.length)]) }}
      onPointerOver={() => { hover.current = true; document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { hover.current = false; document.body.style.cursor = '' }}
    >
      <primitive object={model} />
    </group>
  )
}

function Pedestal() {
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.4
  })
  return (
    <group position={[0, -2.35, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[1.55, 1.7, 0.18, 64]} />
        <meshPhysicalMaterial color="#FFFFFF" roughness={0.15} clearcoat={1} iridescence={0.6} />
      </mesh>
      <mesh ref={ring} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.62, 0.025, 12, 128]} />
        <meshBasicMaterial color="#8A7DFF" toneMapped={false} />
      </mesh>
    </group>
  )
}

function Satellites() {
  return (
    <>
      <Float speed={2} rotationIntensity={1.4} floatIntensity={1.6}>
        <RoundedBox args={[0.38, 0.38, 0.38]} radius={0.1} position={[-2.5, 1.2, -0.8]}>
          <meshPhysicalMaterial color="#FF8AC0" roughness={0.15} clearcoat={1} iridescence={0.6} />
        </RoundedBox>
      </Float>
      <Float speed={1.6} rotationIntensity={1} floatIntensity={2}>
        <mesh position={[2.5, -0.6, -0.4]}>
          <sphereGeometry args={[0.22, 48, 48]} />
          <meshPhysicalMaterial color="#5FE0F5" roughness={0.1} clearcoat={1} iridescence={0.5} />
        </mesh>
      </Float>
      <Float speed={2.4} rotationIntensity={2} floatIntensity={1.2}>
        <mesh position={[2.1, 1.8, -1.2]}>
          <octahedronGeometry args={[0.24]} />
          <meshPhysicalMaterial color="#FFC870" roughness={0.12} metalness={0.2} clearcoat={1} />
        </mesh>
      </Float>
      <Float speed={1.8} rotationIntensity={1.6} floatIntensity={1.4}>
        <mesh position={[-2.2, -1.1, 0.2]}>
          <torusGeometry args={[0.18, 0.07, 24, 48]} />
          <meshPhysicalMaterial color="#8A7DFF" roughness={0.12} clearcoat={1} iridescence={0.8} />
        </mesh>
      </Float>
    </>
  )
}

export default function HeroScene(props: HeroSceneProps) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)

  // Stop rendering while the hero is scrolled out of view or the tab is hidden.
  useEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && document.visibilityState !== 'hidden'))
    observer.observe(node)
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  return (
    <div ref={host} className="hero-canvas">
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 1.8]}
        shadows
        camera={{ position: [0, 0.6, 8.6], fov: 36 }}
        gl={{ alpha: true, antialias: true, toneMapping: ACESFilmicToneMapping }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 6, 5]} intensity={1.8} castShadow />
        <pointLight position={[-4, 1, 3]} intensity={22} color="#FF4FA3" />
        <pointLight position={[4, 2, 2]} intensity={22} color="#12C2E9" />

        <Avatar {...props} />
        <Pedestal />
        <Satellites />
        <Sparkles count={50} scale={[7, 5, 3]} size={2.2} speed={0.35} color="#8A7DFF" opacity={0.7} />

        <ContactShadows position={[0, -2.45, 0]} opacity={0.4} scale={8} blur={2.6} far={3} color="#5B4BFF" />

        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 5, -6]} scale={[12, 6, 1]} />
          <Lightformer form="rect" intensity={4} color="#8A7DFF" position={[-6, 1, -1]} rotation-y={Math.PI / 2} scale={[4, 10, 1]} />
          <Lightformer form="rect" intensity={4} color="#FF4FA3" position={[6, -1, -1]} rotation-y={-Math.PI / 2} scale={[4, 10, 1]} />
          <Lightformer form="circle" intensity={3} color="#12C2E9" position={[0, -5, 2]} rotation-x={-Math.PI / 2} scale={6} />
        </Environment>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL_URL)
