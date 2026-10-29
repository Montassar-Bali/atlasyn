import { businessSystems } from './experienceData'
import { hidePointerAffordance, showPointerAffordance } from './interaction'
import type { BusinessSystemSelection, ExperienceSceneProps } from './types'

const orbitPalette = ['#005AEE', '#03B6ED', '#0095EC', '#F1A63C', '#8FD8EE'] as const

const orbitLayout = [
  { radius: 1.48, tilt: [0.12, 0.22, 0.12], phase: 0.22 },
  { radius: 1.76, tilt: [0.72, -0.18, 0.32], phase: 1.46 },
  { radius: 2.04, tilt: [1.12, 0.26, -0.18], phase: 2.64 },
  { radius: 2.32, tilt: [0.46, 0.82, 0.54], phase: 3.82 },
  { radius: 2.58, tilt: [1.36, -0.42, 0.18], phase: 5.06 },
] as const

interface OrbitSystemProps {
  index: number
  system: BusinessSystemSelection
  color: string
  radius: number
  tilt: readonly [number, number, number]
  phase: number
  onSelect?: ExperienceSceneProps['onSelectSystem']
  compact: boolean
}

function OrbitSystem({ index, system, color, radius, tilt, phase, onSelect, compact }: OrbitSystemProps) {
  const nodeSize = 0.12 + system.score / 850
  const nodePosition: [number, number, number] = [
    Math.cos(phase) * radius,
    Math.sin(phase) * radius,
    0,
  ]

  return (
    <group rotation={[...tilt]}>
      <mesh>
        <torusGeometry args={[radius, 0.009, 5, compact ? 56 : 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <group
        position={nodePosition}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(index, system)
        }}
        onPointerOver={onSelect ? showPointerAffordance : undefined}
        onPointerOut={onSelect ? hidePointerAffordance : undefined}
      >
        <mesh castShadow>
          <sphereGeometry args={[nodeSize, 18, 12]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.65}
            roughness={0.28}
          />
        </mesh>
        <mesh scale={1.8}>
          <sphereGeometry args={[nodeSize, 14, 10]} />
          <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
        </mesh>
      </group>
    </group>
  )
}

export function BusinessHealthCore({
  onSelectSystem,
  compact = false,
}: Pick<ExperienceSceneProps, 'onSelectSystem'> & { compact?: boolean }) {
  return (
    <group name="business-health-core">
      <mesh castShadow>
        <sphereGeometry args={[0.78, compact ? 24 : 32, compact ? 14 : 20]} />
        <meshPhysicalMaterial
          color="#035C94"
          emissive="#005AEE"
          emissiveIntensity={0.45}
          metalness={0.18}
          roughness={0.18}
          clearcoat={0.7}
          clearcoatRoughness={0.2}
        />
      </mesh>
      <mesh scale={1.18}>
        <icosahedronGeometry args={[0.88, compact ? 1 : 2]} />
        <meshBasicMaterial
          color="#03B6ED"
          transparent
          opacity={0.16}
          wireframe
          depthWrite={false}
        />
      </mesh>
      <mesh scale={1.66}>
        <sphereGeometry args={[0.75, 24, 16]} />
        <meshBasicMaterial color="#005AEE" transparent opacity={0.055} depthWrite={false} />
      </mesh>

      <group name="atlasyn-core-dots">
        {(['#03B6ED', '#0095EC', '#005AEE'] as const).map((color, index) => (
          <mesh key={color} position={[(index - 1) * 0.31, 0, 0.72]}>
            <sphereGeometry args={[0.085, 16, 10]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {businessSystems.map((system, index) => {
        const layout = orbitLayout[index]
        return (
          <OrbitSystem
            key={system.id}
            index={index}
            system={system}
            color={orbitPalette[index]}
            radius={layout.radius}
            tilt={layout.tilt}
            phase={layout.phase}
            onSelect={onSelectSystem}
            compact={compact}
          />
        )
      })}
    </group>
  )
}
