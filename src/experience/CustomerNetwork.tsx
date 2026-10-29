import { Line } from '@react-three/drei'
import type { Vector3Tuple } from 'three'
import { businessSystems, customerSelections } from './experienceData'
import { hidePointerAffordance, showPointerAffordance } from './interaction'
import type { ExperienceSceneProps } from './types'

const customerPositions: readonly Vector3Tuple[] = [
  [-3.15, 1.18, 0.4],
  [2.95, 1.04, 0.15],
  [-2.35, -1.48, -0.25],
  [1.82, -1.22, -0.48],
  [0.28, 1.72, -1.08],
]

const highlightedCustomers = new Set([
  'Carthage Distribution',
  'Medina Retail Group',
  'Sahara Logistics',
])

function riskColor(risk: number) {
  if (risk >= 85) return '#F0646E'
  if (risk >= 75) return '#F1A63C'
  if (risk >= 65) return '#0095EC'
  return '#03B6ED'
}

export function CustomerNetwork({
  onSelectCustomer,
  onSelectSystem,
  compact = false,
}: Pick<ExperienceSceneProps, 'onSelectCustomer' | 'onSelectSystem'> & { compact?: boolean }) {
  return (
    <group name="customer-network">
      <mesh>
        <sphereGeometry args={[0.42, 24, 16]} />
        <meshStandardMaterial
          color="#005AEE"
          emissive="#005AEE"
          emissiveIntensity={0.55}
          roughness={0.32}
        />
      </mesh>
      <mesh scale={1.7}>
        <sphereGeometry args={[0.4, 18, 12]} />
        <meshBasicMaterial color="#03B6ED" transparent opacity={0.08} depthWrite={false} />
      </mesh>

      {customerSelections.slice(0, customerPositions.length).map((customer, index) => {
        const position = customerPositions[index]
        const color = riskColor(customer.risk)
        const value = Number(customer.value.replace(/[^\d]/g, ''))
        const radius = 0.17 + (value / 12_840) * 0.19
        const highlighted = highlightedCustomers.has(customer.name)

        return (
          <group key={customer.name}>
            <Line
              points={[[0, 0, 0], position]}
              color={color}
              lineWidth={highlighted ? 1.25 : 0.7}
              transparent
              opacity={highlighted ? 0.5 : 0.24}
            />
            <group
              name={highlighted ? 'high-risk-customer' : undefined}
              position={position}
              onClick={(event) => {
                event.stopPropagation()
                if (onSelectCustomer) onSelectCustomer(index, customer)
                else onSelectSystem?.(1, businessSystems[1])
              }}
              onPointerOver={onSelectCustomer || onSelectSystem ? showPointerAffordance : undefined}
              onPointerOut={onSelectCustomer || onSelectSystem ? hidePointerAffordance : undefined}
            >
              <mesh castShadow>
                <sphereGeometry args={[radius, compact ? 14 : 20, compact ? 9 : 12]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={highlighted ? 0.72 : 0.35}
                  roughness={0.27}
                />
              </mesh>
              {highlighted && (
                <>
                  <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[radius * 1.55, 0.018, 5, 48]} />
                    <meshBasicMaterial color={color} transparent opacity={0.55} depthWrite={false} />
                  </mesh>
                  <mesh scale={2.05}>
                    <sphereGeometry args={[radius, 14, 9]} />
                    <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} />
                  </mesh>
                </>
              )}
            </group>
          </group>
        )
      })}

      <mesh position={[0, 0, -1.5]}>
        <planeGeometry args={[8.5, 5.2]} />
        <meshBasicMaterial color="#012B4E" transparent opacity={0.045} depthWrite={false} />
      </mesh>
    </group>
  )
}
