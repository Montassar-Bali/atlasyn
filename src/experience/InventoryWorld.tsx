import { Line } from '@react-three/drei'
import type { Vector3Tuple } from 'three'
import { businessSystems, inventorySelections } from './experienceData'
import { hidePointerAffordance, showPointerAffordance } from './interaction'
import type { ExperienceSceneProps } from './types'

const blockPositions: readonly Vector3Tuple[] = [
  [-2.25, 0, -1.15],
  [0, 0, -1.15],
  [2.25, 0, -1.15],
  [-1.12, 0, 1.15],
  [1.12, 0, 1.15],
]

const maxStock = Math.max(...inventorySelections.map((item) => item.stock))
const maxDemand = Math.max(...inventorySelections.map((item) => item.predictedDemand))

function stockHeight(stock: number) {
  return 0.45 + (stock / maxStock) * 2.05
}

function demandHeight(demand: number) {
  return 0.45 + (demand / maxDemand) * 2.75
}

export function InventoryWorld({
  onSelectInventory,
  onSelectSystem,
}: Pick<ExperienceSceneProps, 'onSelectInventory' | 'onSelectSystem'>) {
  const visibleInventory = inventorySelections.slice(0, blockPositions.length)
  const demandCurvePoints: Vector3Tuple[] = visibleInventory.map((item, index) => {
    const position = blockPositions[index]
    return [position[0], -1.08 + demandHeight(item.predictedDemand), position[2]]
  })

  return (
    <group name="inventory-world">
      <gridHelper args={[8.5, 17, '#17445F', '#0B2E44']} position={[0, -1.1, 0]} />
      <mesh position={[0, -1.13, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8.5, 6]} />
        <meshStandardMaterial color="#031C2F" roughness={0.92} />
      </mesh>

      {visibleInventory.map((item, index) => {
        const position = blockPositions[index]
        const availableHeight = stockHeight(item.stock)
        const forecastHeight = demandHeight(item.predictedDemand)
        const stockColor = item.critical ? '#D94F5C' : item.status === 'Healthy' ? '#03B6ED' : '#0095EC'

        return (
          <group
            key={item.sku}
            position={[position[0], 0, position[2]]}
            onClick={(event) => {
              event.stopPropagation()
              if (onSelectInventory) onSelectInventory(index, item)
              else onSelectSystem?.(2, businessSystems[2])
            }}
            onPointerOver={onSelectInventory || onSelectSystem ? showPointerAffordance : undefined}
            onPointerOut={onSelectInventory || onSelectSystem ? hidePointerAffordance : undefined}
          >
            <mesh position={[0, -1.08 + availableHeight / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.12, availableHeight, 1.12, 1, 1, 1]} />
              <meshStandardMaterial
                color={stockColor}
                emissive={stockColor}
                emissiveIntensity={item.critical ? 0.48 : 0.18}
                roughness={0.4}
                metalness={0.12}
              />
            </mesh>
            <mesh position={[0, -1.08 + forecastHeight / 2, 0]}>
              <boxGeometry args={[1.26, forecastHeight, 1.26]} />
              <meshBasicMaterial
                color={item.critical ? '#F0646E' : '#8FD8EE'}
                transparent
                opacity={item.critical ? 0.38 : 0.2}
                wireframe
                depthWrite={false}
              />
            </mesh>

            {item.critical && (
              <group name="smart-pos-critical-beacon" position={[0, -1.03 + forecastHeight, 0]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.42, 0.025, 6, 48]} />
                  <meshBasicMaterial color="#F0646E" toneMapped={false} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[0.11, 14, 9]} />
                  <meshBasicMaterial color="#F0646E" toneMapped={false} />
                </mesh>
              </group>
            )}
          </group>
        )
      })}

      <Line
        points={demandCurvePoints}
        color="#03B6ED"
        lineWidth={2.1}
        transparent
        opacity={0.8}
      />
    </group>
  )
}
