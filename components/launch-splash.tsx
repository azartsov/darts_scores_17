"use client"

import { Suspense, lazy, useEffect, useState } from "react"

interface LaunchSplashProps {
  onComplete: () => void
}

const SPLASH_DURATION_MS = 2200
const WEAK_SPLASH_DURATION_MS = 1800

const LaunchSplash3D = lazy(async () => {
  const mod = await import("./launch-splash-3d")
  return { default: mod.LaunchSplash3D }
})

function isWeakDevice(): boolean {
  if (typeof navigator === "undefined") return false

  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const cores = navigator.hardwareConcurrency

  if (reducedMotion) return true
  if (saveData) return true
  if (typeof memory === "number" && memory <= 4) return true
  if (typeof cores === "number" && cores <= 4) return true

  return false
}

function StaticSplash() {
  return (
    <div className="fixed inset-0 z-[120] bg-background flex items-center justify-center">
      <div className="relative w-[320px] h-[320px] max-w-[86vw] max-h-[86vw]">
        <svg viewBox="0 0 320 320" className="w-full h-full drop-shadow-[0_0_40px_rgba(15,23,42,0.65)]">
          <defs>
            <radialGradient id="bgGlow" cx="50%" cy="44%" r="60%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="70%" stopColor="#0b1220" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
            <linearGradient id="dartMetal" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="320" height="320" rx="32" fill="url(#bgGlow)" />

          <circle cx="160" cy="160" r="124" fill="#111827" stroke="#334155" strokeWidth="4" />
          <circle cx="160" cy="160" r="106" fill="#f8fafc" />
          <circle cx="160" cy="160" r="78" fill="#0f172a" />
          <circle cx="160" cy="160" r="48" fill="#f8fafc" />

          <path d="M160 36 L168 84 L152 84 Z" fill="#dc2626" />
          <path d="M160 84 L166 112 L154 112 Z" fill="#16a34a" />
          <text x="160" y="31" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">20</text>

          <circle cx="160" cy="89" r="18" fill="none" stroke="#f59e0b" strokeWidth="2" opacity="0.95" />
          <circle cx="160" cy="89" r="9" fill="none" stroke="#facc15" strokeWidth="2" opacity="0.95" />

          {/* Dart fixed in T20 */}
          <g transform="translate(160 89) rotate(-82)">
            <polygon points="-72,-9 -62,0 -72,9" fill="#3b82f6" />
            <rect x="-62" y="-2" width="52" height="4" rx="2" fill="url(#dartMetal)" />
            <rect x="-12" y="-3" width="10" height="6" rx="2" fill="#60a5fa" />
            <polygon points="0,-4 14,0 0,4" fill="#f59e0b" />
          </g>
        </svg>

        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
          <div className="text-slate-100/90 font-semibold tracking-widest text-sm">DARTMASTER PRO</div>
          <div className="text-slate-300/70 text-xs mt-1">T20 IMPACT</div>
        </div>
      </div>
    </div>
  )
}

export function LaunchSplash({ onComplete }: LaunchSplashProps) {
  const [weakMode, setWeakMode] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setWeakMode(isWeakDevice())
  }, [])

  useEffect(() => {
    const duration = weakMode ? WEAK_SPLASH_DURATION_MS : SPLASH_DURATION_MS
    const timer = setTimeout(() => onComplete(), duration)
    return () => clearTimeout(timer)
  }, [onComplete, weakMode])

  if (!mounted || weakMode) {
    return <StaticSplash />
  }

  return (
    <Suspense fallback={<StaticSplash />}>
      <LaunchSplash3D />
    </Suspense>
  )
}
