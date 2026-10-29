import { Line } from '@react-three/drei'
import type { Vector3Tuple } from 'three'
import { businessSystems, customerSelections, inventorySelections } from './experienceData'
import { hidePointerAffordance, showPointerAffordance } from './interaction'
import type { ExperienceSceneProps } from './types'

const decisionPositions: readonly Vector3Tuple[] = [
  [-2.45, -0.1, 0.25],
  [0, -0.1, -0.38],
  [2.45, -0.1, 0.25],
]

const decisions = [
  { color: '#F0646E', impact: 8_200, evidence: 3, urgency: 0.9 },
  { color: '#F1A63C', impact: 4_200, evidence: 1, urgency: 0.76 },
  { color: '#005AEE', impact: 12_600, evidence: 5, urgency: 0.82 },
] as const

export function PriorityBriefingLayer({
  onSelectSystem,
  onSelectCustomer,
  onSelectInventory,
}: ExperienceSceneProps) {
  return (
    <group name="priority-briefing-layer">
      {decisions.map((decision, index) => {
        const position = decisionPositions[index]
        const impactHeight = 0.75 + decision.impact / 7_500
        const interactive = index === 0
          ? Boolean(onSelectCustomer || onSelectSystem)
          : index === 1
            ? Boolean(onSelectSystem)
            : Boolean(onSelectInventory || onSelectSystem)
        const select = () => {
          if (index === 0 && onSelectCustomer) onSelectCustomer(0, customerSelections[0])
          else if (index === 0) onSelectSystem?.(1, businessSystems[1])
          if (index === 1) onSelectSystem?.(3, businessSystems[3])
          if (index === 2 && onSelectInventory) onSelectInventory(0, inventorySelections[0])
          else if (index === 2) onSelectSystem?.(2, businessSystems[2])
        }

        return (
          <group
            key={decision.color}
            position={position}
            onClick={(event) => {
              event.stopPropagation()
              select()
            }}
            onPointerOver={interactive ? showPointerAffordance : undefined}
            onPointerOut={interactive ? hidePointerAffordance : undefined}
          >
            <mesh position={[0, -0.78, 0]} receiveShadow>
              <boxGeometry args={[1.72, 0.08, 2.18]} />
              <meshStandardMaterial
                color="#062943"
                emissive={decision.color}
                emissiveIntensity={0.08}
                roughness={0.68}
                metalness={0.18}
              />
            </mesh>
            <mesh position={[0, -0.74 + impactHeight / 2, 0]} castShadow>
              <boxGeometry args={[0.34, impactHeight, 0.34]} />
              <meshStandardMaterial
                color={decision.color}
                emissive={decision.color}
                emissiveIntensity={0.52}
                roughness={0.3}
              />
            </mesh>
            <mesh position={[0, -0.74 + impactHeight * decision.urgency, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.43, 0.022, 6, 44]} />
              <meshBasicMaterial color={decision.color} toneMapped={false} />
            </mesh>
            {Array.from({ length: decision.evidence }, (_, evidenceIndex) => {
              const angle = (evidenceIndex / decision.evidence) * Math.PI * 2
              return (
                <mesh
                  key={evidenceIndex}
                  position={[
                    Math.cos(angle) * 0.58,
                    -0.67,
                    Math.sin(angle) * 0.58,
                  ]}
                >
                  <sphereGeometry args={[0.07, 12, 8]} />
                  <meshBasicMaterial color={decision.color} toneMapped={false} />
                </mesh>
              )
            })}
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[1.35, 2.55, 1.35]} />
              <meshBasicMaterial
                color={decision.color}
                transparent
                opacity={0.055}
                wireframe
                depthWrite={false}
              />
            </mesh>
          </group>
        )
      })}

      {decisionPositions.map((position, index) => (
        <Line
          key={`decision-link-${index}`}
          points={[[0, -0.72, -1.35], [position[0], -0.72, position[2]]]}
          color={decisions[index].color}
          lineWidth={0.8}
          transparent
          opacity={0.34}
        />
      ))}
      <mesh position={[0, -0.72, -1.35]}>
        <icosahedronGeometry args={[0.24, 1]} />
        <meshStandardMaterial
          color="#03B6ED"
          emissive="#005AEE"
          emissiveIntensity={0.8}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}
