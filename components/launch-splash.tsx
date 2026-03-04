"use client"

import { APP_VERSION } from "@/lib/version"

interface LaunchSplashProps {
  onComplete: () => void
}

export function LaunchSplash({ onComplete }: LaunchSplashProps) {
  return (
    <div
      suppressHydrationWarning
      className="fixed inset-0 z-[120] bg-background flex items-center justify-center px-6"
      onClick={onComplete}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onComplete()
        }
      }}
      aria-label="Continue to app"
    >
      <div className="w-full max-w-[360px] text-center space-y-4">
        <svg viewBox="0 0 320 320" className="w-full h-auto drop-shadow-[0_0_34px_rgba(15,23,42,0.55)]">
          <defs>
            <radialGradient id="targetBg" cx="50%" cy="50%" r="52%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="72%" stopColor="#0b1220" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
          </defs>

          <rect x="12" y="12" width="296" height="296" rx="28" fill="url(#targetBg)" />

          <circle cx="160" cy="160" r="125" fill="#111827" stroke="#334155" strokeWidth="4" />
          <circle cx="160" cy="160" r="105" fill="#f8fafc" />
          <circle cx="160" cy="160" r="80" fill="#0f172a" />
          <circle cx="160" cy="160" r="58" fill="#f8fafc" />
          <circle cx="160" cy="160" r="30" fill="#16a34a" />
          <circle cx="160" cy="160" r="14" fill="#dc2626" />

          <text x="160" y="42" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">20</text>
          <text x="160" y="286" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">3</text>
          <text x="36" y="166" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">11</text>
          <text x="284" y="166" textAnchor="middle" fill="#e2e8f0" fontSize="16" fontWeight="800">6</text>
        </svg>

        <div className="pointer-events-none text-center">
          <div className="text-slate-100/95 font-semibold tracking-[0.16em] text-sm uppercase">Darts Scorer</div>
          <div className="text-slate-400/80 text-xs mt-1">v{APP_VERSION}</div>
          <div className="text-slate-300/75 text-xs mt-3">Tap anywhere to continue</div>
        </div>

        <button
          type="button"
          className="mx-auto mt-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          onClick={(event) => {
            event.stopPropagation()
            onComplete()
          }}
        >
          Continue
        </button>
      </div>
    </div>
  )
}
