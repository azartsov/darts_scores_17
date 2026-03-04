"use client"

import { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment } from "@react-three/drei"
import * as THREE from "three"

const FLIGHT_SECONDS = 1.35
const TRAIL_COUNT = 6

function Dart({ target }: { target: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null)
  const impactRef = useRef(false)
  const trailRefs = useRef<Array<THREE.Mesh | null>>([])

  const start = useMemo(() => new THREE.Vector3(2.2, 0.9, 2.8), [])
  const trailPointsRef = useRef(Array.from({ length: TRAIL_COUNT }, () => new THREE.Vector3(2.2, 0.9, 2.8)))

  useFrame(({ clock }) => {
    if (!ref.current) return

    const t = Math.min(clock.getElapsedTime() / FLIGHT_SECONDS, 1)
    const eased = 1 - Math.pow(1 - t, 3)

    const temp = start.clone().lerp(target, eased)
    temp.x += Math.sin(eased * Math.PI) * 0.18
    temp.y += Math.sin(eased * Math.PI) * 0.08

    ref.current.position.copy(temp)

    const dir = temp.clone().sub(target).normalize()
    ref.current.lookAt(temp.clone().add(dir))
    ref.current.rotateY(Math.PI)

    trailPointsRef.current.unshift(temp.clone())
    trailPointsRef.current.pop()
    trailRefs.current.forEach((mesh, idx) => {
      if (!mesh) return
      mesh.position.copy(trailPointsRef.current[idx])
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.opacity = Math.max(0, 0.32 - idx * 0.05)
    })

    if (t >= 1 && !impactRef.current) {
      impactRef.current = true
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate([14, 32, 20])
      }
    }
  })

  return (
    <>
      {Array.from({ length: TRAIL_COUNT }).map((_, idx) => (
        <mesh
          key={idx}
          ref={(node) => {
            trailRefs.current[idx] = node
          }}
        >
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial color="#93c5fd" transparent opacity={0.18} emissive="#1d4ed8" emissiveIntensity={0.35} />
        </mesh>
      ))}

      <group ref={ref} position={[2.2, 0.9, 2.8]}>
        <mesh position={[0.27, 0, 0]} castShadow>
          <coneGeometry args={[0.03, 0.14, 14]} />
          <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.2} emissive="#f59e0b" emissiveIntensity={0.22} />
        </mesh>
        <mesh castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.58, 14]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[-0.31, 0, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.08, 12]} />
          <meshStandardMaterial color="#60a5fa" metalness={0.4} roughness={0.35} emissive="#3b82f6" emissiveIntensity={0.28} />
        </mesh>
        <mesh position={[-0.4, 0.035, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <boxGeometry args={[0.12, 0.07, 0.01]} />
          <meshStandardMaterial color="#2563eb" metalness={0.2} roughness={0.45} />
        </mesh>
        <mesh position={[-0.4, -0.035, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <boxGeometry args={[0.12, 0.07, 0.01]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.2} roughness={0.45} />
        </mesh>
      </group>
    </>
  )
}

function ImpactPulse({ center }: { center: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = Math.max(0, (clock.getElapsedTime() - FLIGHT_SECONDS) / 0.6)
    const k = Math.min(t, 1)
    const scale = 1 + k * 2.1
    ref.current.scale.set(scale, scale, scale)

    const mat = ref.current.material as THREE.MeshBasicMaterial
    mat.opacity = Math.max(0, 0.85 - k * 0.85)
  })

  return (
    <mesh ref={ref} position={center} rotation={[0, 0, 0]}>
      <ringGeometry args={[0.035, 0.065, 48]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0} />
    </mesh>
  )
}

function Board({ target }: { target: THREE.Vector3 }) {
  const triple20Theta = useMemo(() => {
    const sector = (Math.PI * 2) / 20
    const center = Math.PI / 2
    return { start: center - sector / 2, length: sector }
  }, [])

  return (
    <group position={[0, 0, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[1.55, 1.55, 0.13, 80]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>

      <mesh position={[0, 0, 0.071]}>
        <ringGeometry args={[1.28, 1.5, 90]} />
        <meshStandardMaterial color="#111827" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0, 0.072]}>
        <ringGeometry args={[0.95, 1.12, 90]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.073]}>
        <ringGeometry args={[0.7, 0.9, 90]} />
        <meshStandardMaterial color="#0f172a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.074]}>
        <ringGeometry args={[0.44, 0.62, 90]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.8} />
      </mesh>

      <mesh position={[0, 0, 0.079]}>
        <ringGeometry args={[0.98, 1.11, 80, 1, triple20Theta.start, triple20Theta.length]} />
        <meshStandardMaterial color="#dc2626" emissive="#7f1d1d" emissiveIntensity={0.35} />
      </mesh>

      <mesh position={[0, 0, 0.08]}>
        <circleGeometry args={[0.2, 64]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      <mesh position={[0, 0, 0.082]}>
        <circleGeometry args={[0.095, 64]} />
        <meshStandardMaterial color="#dc2626" emissive="#7f1d1d" emissiveIntensity={0.25} />
      </mesh>

      <mesh position={[0, 1.62, 0.12]}>
        <planeGeometry args={[0.34, 0.16]} />
        <meshBasicMaterial color="#e2e8f0" transparent opacity={0.95} />
      </mesh>

      <ImpactPulse center={target} />
    </group>
  )
}

function Scene() {
  const target = useMemo(() => new THREE.Vector3(0, 1.03, 0.09), [])
  const cameraStart = useMemo(() => new THREE.Vector3(0.4, 0.35, 5.5), [])
  const cameraEnd = useMemo(() => new THREE.Vector3(0, 0.1, 4.2), [])

  useFrame(({ camera, clock }) => {
    const t = Math.min(clock.getElapsedTime() / 1.8, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    const pos = cameraStart.clone().lerp(cameraEnd, eased)
    pos.x += Math.sin(clock.getElapsedTime() * 1.1) * 0.03
    camera.position.copy(pos)
    camera.lookAt(0, 0.26, 0.02)
  })

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <fog attach="fog" args={["#020617", 4.5, 9]} />

      <ambientLight intensity={0.62} />
      <directionalLight
        position={[1.8, 2.6, 2.8]}
        intensity={1.7}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <spotLight position={[0, 3.2, 1.8]} intensity={1.5} angle={0.45} penumbra={0.7} />
      <pointLight position={[0, 1.05, 0.35]} color="#f59e0b" intensity={1.2} distance={2.5} />

      <group rotation={[-0.08, 0, 0]}>
        <Board target={target} />
      </group>
      <Dart target={target} />

      <Environment preset="city" />
    </>
  )
}

export function LaunchSplash3D() {
  return (
    <div className="fixed inset-0 z-[120] bg-background">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0.2, 4.6], fov: 38 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Scene />
      </Canvas>

      <div className="pointer-events-none absolute bottom-7 left-1/2 -translate-x-1/2 text-center">
        <div className="text-slate-100/90 font-semibold tracking-widest text-sm">DARTMASTER PRO</div>
        <div className="text-slate-300/70 text-xs mt-1">T20 IMPACT</div>
      </div>
    </div>
  )
}
