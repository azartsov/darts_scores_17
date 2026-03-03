"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n/context"
import type { FinishMode } from "@/lib/game-types"
import { Undo2, MoreVertical, RotateCcw, Home, HelpCircle, Settings2 } from "lucide-react"
import { APP_VERSION } from "@/lib/version"
import { useAuth } from "@/lib/auth-context"
import {
  clampTouchHoldDelayMs,
  DEFAULT_TOUCH_HOLD_DELAY_MS,
  MAX_TOUCH_HOLD_DELAY_MS,
  MIN_TOUCH_HOLD_DELAY_MS,
  TOUCH_HOLD_DELAY_EVENT,
  TOUCH_HOLD_DELAY_STORAGE_KEY,
  loadUserTouchHoldDelayMs,
  saveUserTouchHoldDelayMs,
} from "@/lib/user-settings"

interface GameControlsProps {
  onUndo: () => void
  onNewGame: () => void
  onResetGame: () => void
  canUndo: boolean
  finishMode: FinishMode
}

export function GameControls({ onUndo, onNewGame, onResetGame, canUndo, finishMode }: GameControlsProps) {
  const { t } = useI18n()
  const [showRules, setShowRules] = useState(false)
  const [showInputSettings, setShowInputSettings] = useState(false)
  const [touchHoldDelayMs, setTouchHoldDelayMs] = useState(DEFAULT_TOUCH_HOLD_DELAY_MS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { user, isGuest } = useAuth()

  useEffect(() => {
    const localRaw = localStorage.getItem(TOUCH_HOLD_DELAY_STORAGE_KEY)
    if (localRaw !== null) {
      setTouchHoldDelayMs(clampTouchHoldDelayMs(Number.parseInt(localRaw, 10)))
    } else {
      setTouchHoldDelayMs(DEFAULT_TOUCH_HOLD_DELAY_MS)
    }
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (!user?.uid || isGuest) return
    let cancelled = false
    loadUserTouchHoldDelayMs(user.uid)
      .then((remoteValue) => {
        if (cancelled || remoteValue === null) return
        setTouchHoldDelayMs(remoteValue)
        localStorage.setItem(TOUCH_HOLD_DELAY_STORAGE_KEY, String(remoteValue))
        window.dispatchEvent(new CustomEvent<number>(TOUCH_HOLD_DELAY_EVENT, { detail: remoteValue }))
      })
      .catch(() => {
        // ignore settings loading errors
      })
    return () => {
      cancelled = true
    }
  }, [user?.uid, isGuest])

  useEffect(() => {
    if (!settingsLoaded) return
    const clamped = clampTouchHoldDelayMs(touchHoldDelayMs)
    localStorage.setItem(TOUCH_HOLD_DELAY_STORAGE_KEY, String(clamped))
    window.dispatchEvent(new CustomEvent<number>(TOUCH_HOLD_DELAY_EVENT, { detail: clamped }))

    if (!user?.uid || isGuest) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = setTimeout(() => {
      saveUserTouchHoldDelayMs(user.uid, clamped).catch(() => {
        // ignore settings save errors
      })
    }, 350)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [touchHoldDelayMs, settingsLoaded, user?.uid, isGuest])

  // Get dynamic content based on finish mode
  const rulesSubtitle = finishMode === "simple" ? t.rulesSimpleSubtitle : t.rulesDoubleSubtitle
  const objectiveDesc = finishMode === "simple" ? t.objectiveSimpleDesc : t.objectiveDoubleDesc
  const bustDesc = finishMode === "simple" ? t.bustSimpleDesc : t.bustDoubleDesc
  const checkoutDesc = finishMode === "simple" ? t.checkoutSimpleDesc : t.checkoutDoubleDesc

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={onUndo}
        disabled={!canUndo}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 h-7 w-7"
        aria-label={t.undo}
        title={t.undo}
      >
        <Undo2 className="w-4 h-4" />
      </Button>

      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-7 w-7">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover border-border">
            <DropdownMenuItem className="cursor-pointer" onSelect={() => setShowInputSettings(true)}>
              <Settings2 className="w-4 h-4 mr-2" />
              {t.inputSettings}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => setShowRules(true)}>
              <HelpCircle className="w-4 h-4 mr-2" />
              {t.howToPlay}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResetGame} className="cursor-pointer">
              <RotateCcw className="w-4 h-4 mr-2" />
              {t.resetScores}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNewGame} className="cursor-pointer">
              <Home className="w-4 h-4 mr-2" />
              {t.newGame}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t.rulesTitle}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {rulesSubtitle}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-foreground">
            <div>
              <h4 className="font-semibold text-primary mb-1">{t.objective}</h4>
              <p className="text-muted-foreground">
                {objectiveDesc}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-primary mb-1">{t.scoring}</h4>
              <p className="text-muted-foreground">
                {t.scoringDesc}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-primary mb-1">{t.bustRule}</h4>
              <p className="text-muted-foreground">
                {bustDesc}
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-primary mb-1">{t.checkout}</h4>
              <p className="text-muted-foreground">
                {checkoutDesc}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border/50 text-center text-xs text-muted-foreground">
            <span>Version {APP_VERSION}</span>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showInputSettings} onOpenChange={setShowInputSettings}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">{t.inputSettings}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t.touchHoldConfirmDelay}: {touchHoldDelayMs} ms
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="range"
              min={MIN_TOUCH_HOLD_DELAY_MS}
              max={MAX_TOUCH_HOLD_DELAY_MS}
              step={100}
              value={touchHoldDelayMs}
              onChange={(e) => setTouchHoldDelayMs(clampTouchHoldDelayMs(Number.parseInt(e.target.value, 10)))}
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t.touchHoldDelayNoHint}</span>
              <span>{MAX_TOUCH_HOLD_DELAY_MS} ms</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
