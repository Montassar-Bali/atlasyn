import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { Vector3 } from 'three'
import { revenueData } from '../data'
import { businessSystems } from './experienceData'
import { hidePointerAffordance, showPointerAffordance } from './interaction'
import type { ExperienceSceneProps } from './types'

function revenuePoint(index: number, value: number) {
  return new Vector3(
    (index - 4) * 0.92,
    -0.8 + (value - 90) / 34,
    Math.sin(index * 0.85) * 0.16,
  )
}

const actualPoints = revenueData.flatMap((entry, index) => (
  entry.actual === null ? [] : [revenuePoint(index, entry.actual)]
))

const forecastPoints = revenueData.flatMap((entry, index) => (
  entry.forecast === null ? [] : [revenuePoint(index, entry.forecast)]
))

const upperConfidence = forecastPoints.map((point, index) => (
  point.clone().add(new Vector3(0, 0.22 + index * 0.055, 0.1))
))

const lowerConfidence = forecastPoints.map((point, index) => (
  point.clone().add(new Vector3(0, -0.22 - index * 0.055, -0.1))
))

export function RevenueLandscape({ onSelectSystem }: Pick<ExperienceSceneProps, 'onSelectSystem'>) {
  const selectRevenue = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    onSelectSystem?.(0, businessSystems[0])
  }

  return (
    <group
      name="revenue-landscape"
      onClick={selectRevenue}
      onPointerOver={onSelectSystem ? showPointerAffordance : undefined}
      onPointerOut={onSelectSystem ? hidePointerAffordance : undefined}
    >
      <gridHelper args={[9, 18, '#17445F', '#0B2E44']} position={[0, -1.16, 0]} />
      <mesh position={[0, -1.19, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[9.4, 4.8]} />
        <meshStandardMaterial color="#031C2F" roughness={0.9} metalness={0.05} />
      </mesh>

      <mesh position={[2.25, -1.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.55, 3.8]} />
        <meshBasicMaterial color="#03B6ED" transparent opacity={0.075} depthWrite={false} />
      </mesh>

      {actualPoints.map((point, index) => (
        <group key={`actual-${index}`}>
          <Line
            points={[
              [point.x, -1.14, point.z],
              [point.x, point.y, point.z],
            ]}
            color="#005AEE"
            lineWidth={0.7}
            transparent
            opacity={0.42}
          />
          <mesh position={point} castShadow>
            <sphereGeometry args={[index === actualPoints.length - 1 ? 0.12 : 0.075, 16, 10]} />
            <meshStandardMaterial
              color="#DDF7FF"
              emissive="#005AEE"
              emissiveIntensity={index === actualPoints.length - 1 ? 1.4 : 0.75}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}

      <Line points={actualPoints} color="#005AEE" lineWidth={3.2} />
      <Line
        points={forecastPoints}
        color="#03B6ED"
        lineWidth={2.2}
        dashed
        dashSize={0.18}
        gapSize={0.12}
        transparent
        opacity={0.92}
      />
      <Line points={upperConfidence} color="#03B6ED" lineWidth={0.8} transparent opacity={0.24} />
      <Line points={lowerConfidence} color="#03B6ED" lineWidth={0.8} transparent opacity={0.24} />

      {forecastPoints.slice(1).map((point, index) => (
        <mesh key={`forecast-${index}`} position={point}>
          <sphereGeometry args={[0.07, 14, 8]} />
          <meshBasicMaterial color="#03B6ED" transparent opacity={0.72} depthWrite={false} />
        </mesh>
      ))}

      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
