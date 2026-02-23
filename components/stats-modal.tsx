"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/context"
import {
  fetchUserGames,
  gamesToXml,
  parseBackupXml,
  deleteAllUserGames,
  restoreGames,
  type SavedGame,
} from "@/lib/game-firestore"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { BarChart3, X, Loader2, Trophy, Calendar, ChevronDown, ChevronRight, Download, Upload, Share2, AlertTriangle, MoreVertical, Clipboard, Info } from "lucide-react"

interface StatsModalProps {
  userId: string
  onClose: () => void
}

interface PlayerRanking {
  name: string
  gamesPlayed: number
  wins: number
  winPct: number
  avgPer3: number
  checkoutPct: number | null
}

interface MonthGroup {
  label: string
  sortKey: string
  games: SavedGame[]
}

export function StatsModal({ userId, onClose }: StatsModalProps) {
  const { t, language } = useI18n()
  const [games, setGames] = useState<SavedGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"ranking" | "history" | "elo">("ranking")
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [pendingRestoreXml, setPendingRestoreXml] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null)
  const [sharing, setSharing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-hide toasts
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  const reloadGames = useCallback(() => {
    setLoading(true)
    fetchUserGames(userId, 200)
      .then((data) => { setGames(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchUserGames(userId, 200)
      .then((data) => {
        if (!cancelled) {
          setGames(data)
          // Auto-expand the most recent month
          if (data.length > 0) {
            const first = data[0]
            if (first.timestamp) {
              const d = new Date(first.timestamp.seconds * 1000)
              setExpandedMonths(new Set([`${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`]))
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const fe = err as { code?: string; message?: string }
          setError(fe.code === "permission-denied"
            ? (language === "ru" ? "Нет доступа. Проверьте правила Firestore." : "Permission denied. Check Firestore rules.")
            : t.statsLoadError)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, t.statsLoadError, language])

  // Tab 1: Compute player rankings across all games
  const rankings = useMemo((): PlayerRanking[] => {
    const map = new Map<string, {
      games: number; wins: number;
      totalPoints: number; totalDarts: number;
      checkoutSuccesses: number; checkoutAttempts: number;
    }>()

    for (const game of games) {
      for (const p of game.players) {
        const entry = map.get(p.name) || {
          games: 0, wins: 0,
          totalPoints: 0, totalDarts: 0,
          checkoutSuccesses: 0, checkoutAttempts: 0,
        }
        entry.games++
        if (p.name === game.winner) entry.wins++
        // Re-derive avg from stored average and darts:
        // stored avg = (points / darts) * 3, so points = avg * darts / 3
        entry.totalPoints += (p.average * p.totalDarts) / 3
        entry.totalDarts += p.totalDarts
        // CO%: accumulate from saved value
        if (p.checkoutPct !== null && p.checkoutPct !== undefined) {
          // We can only estimate: treat each game as 1 attempt for weighting
          entry.checkoutSuccesses += p.checkoutPct
          entry.checkoutAttempts++
        }
        map.set(p.name, entry)
      }
    }

    return Array.from(map.entries())
      .map(([name, s]) => ({
        name,
        gamesPlayed: s.games,
        wins: s.wins,
        winPct: s.games > 0 ? Math.round((s.wins / s.games) * 1000) / 10 : 0,
        avgPer3: s.totalDarts > 0 ? Math.round((s.totalPoints / s.totalDarts) * 3 * 10) / 10 : 0,
        checkoutPct: s.checkoutAttempts > 0
          ? Math.round((s.checkoutSuccesses / s.checkoutAttempts) * 10) / 10
          : null,
      }))
      // Sort: win% desc → avg/3 desc → CO% desc → name asc
      .sort((a, b) =>
        b.winPct - a.winPct
        || b.avgPer3 - a.avgPer3
        || (b.checkoutPct ?? -1) - (a.checkoutPct ?? -1)
        || a.name.localeCompare(b.name)
      )
  }, [games])

  // ELO rankings: compute ELO per player from game history
  const eloRankings = useMemo(() => {
    const initialRating = 1500
    const K = 32
    type S = {
      rating: number
      games: number
      wins: number
      totalPoints: number
      totalDarts: number
      checkoutSuccesses: number
      checkoutAttempts: number
    }

    const map = new Map<string, S>()

    // Sort games chronologically (oldest first) to apply Elo in order
    const sorted = [...games].slice().sort((a, b) => {
      const ta = a.timestamp?.seconds ?? 0
      const tb = b.timestamp?.seconds ?? 0
      return ta - tb
    })

    // Ensure all players initialized
    for (const g of sorted) {
      for (const p of g.players) {
        if (!map.has(p.name)) {
          map.set(p.name, { rating: initialRating, games: 0, wins: 0, totalPoints: 0, totalDarts: 0, checkoutSuccesses: 0, checkoutAttempts: 0 })
        }
      }
      // For each game, apply outcomes
      const winner = g.winner
      for (const p of g.players) {
        const entry = map.get(p.name)!
        // accumulate raw stats
        entry.games++
        if (p.name === winner) entry.wins++
        entry.totalPoints += (p.average * p.totalDarts) / 3
        entry.totalDarts += p.totalDarts
        if (p.checkoutPct !== null && p.checkoutPct !== undefined) {
          entry.checkoutSuccesses += p.checkoutPct
          entry.checkoutAttempts++
        }
      }

      // Elo update: winner vs each opponent
      if (winner) {
        const winnerEntry = map.get(winner)!
        for (const p of g.players) {
          if (p.name === winner) continue
          const oppEntry = map.get(p.name)!
          const expectedWin = 1 / (1 + Math.pow(10, (oppEntry.rating - winnerEntry.rating) / 400))
          // Update ratings (float)
          winnerEntry.rating += K * (1 - expectedWin)
          oppEntry.rating += K * (0 - (1 - expectedWin))
        }
      }
    }

    // Map to output array
    const out = Array.from(map.entries()).map(([name, s]) => ({
      name,
      gamesPlayed: s.games,
      wins: s.wins,
      elo: Math.round(s.rating),
      winPct: s.games > 0 ? Math.round((s.wins / s.games) * 1000) / 10 : 0,
      avgPer3: s.totalDarts > 0 ? Math.round((s.totalPoints / s.totalDarts) * 3 * 10) / 10 : 0,
      checkoutPct: s.checkoutAttempts > 0 ? Math.round((s.checkoutSuccesses / s.checkoutAttempts) * 10) / 10 : null,
    }))

    // Sort primarily by Elo desc, then winPct desc, then avg desc, then name
    out.sort((a, b) => (b.elo - a.elo) || (b.winPct - a.winPct) || (b.avgPer3 - a.avgPer3) || a.name.localeCompare(b.name))
    return out
  }, [games])

  // Tab 2: Group games by month
  const monthGroups = useMemo((): MonthGroup[] => {
    const map = new Map<string, SavedGame[]>()
    const months = language === "ru"
      ? ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"]
      : ["January","February","March","April","May","June","July","August","September","October","November","December"]

    for (const game of games) {
      if (!game.timestamp) continue
      const d = new Date(game.timestamp.seconds * 1000)
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`
      const arr = map.get(key) || []
      arr.push(game)
      map.set(key, arr)
    }

    return Array.from(map.entries())
      .map(([key, groupGames]) => {
        const [year, month] = key.split("-")
        return {
          label: `${months[parseInt(month)]} ${year}`,
          sortKey: key,
          games: groupGames,
        }
      })
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [games, language])

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const formatDate = (ts: { seconds: number } | null) => {
    if (!ts) return "-"
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
      day: "2-digit", month: "2-digit",
    }) + " " + d.toLocaleTimeString(language === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit", minute: "2-digit",
    })
  }

  // ── Backup handler ──
  const handleBackup = useCallback(async () => {
    setBackingUp(true)
    try {
      const allGames = await fetchUserGames(userId, 9999)
      const xml = gamesToXml(userId, allGames)
      const blob = new Blob([xml], { type: "application/xml" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `darts_backup_${date}.xml`
      a.click()
      URL.revokeObjectURL(url)
      setToast({ msg: t.backupSuccess, type: "ok" })
    } catch {
      setToast({ msg: t.statsLoadError, type: "err" })
    } finally {
      setBackingUp(false)
    }
  }, [userId, t])

  // ── Restore handler ──
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const xmlString = reader.result as string
        const parsed = parseBackupXml(xmlString)
        if (parsed.userId !== userId) {
          setToast({ msg: t.userMismatch, type: "err" })
          return
        }
        setPendingRestoreXml(xmlString)
        setShowRestoreConfirm(true)
      } catch {
        setToast({ msg: t.invalidFile, type: "err" })
      }
    }
    reader.readAsText(file)
    // Reset so re-selecting same file works
    e.target.value = ""
  }, [userId, t])

  const handleRestoreConfirm = useCallback(async () => {
    if (!pendingRestoreXml) return
    setShowRestoreConfirm(false)
    setRestoring(true)
    try {
      const parsed = parseBackupXml(pendingRestoreXml)
      await deleteAllUserGames(userId)
      await restoreGames(userId, parsed.games)
      setPendingRestoreXml(null)
      setToast({ msg: t.restoreSuccess, type: "ok" })
      reloadGames()
    } catch {
      setToast({ msg: t.statsLoadError, type: "err" })
    } finally {
      setRestoring(false)
    }
  }, [pendingRestoreXml, userId, t, reloadGames])

  // ── Share rating (adaptive: mobile=image via Web Share, desktop=copy text) ──
  const isMobileOrTablet = typeof window !== "undefined" && (window.innerWidth <= 1024 || "ontouchstart" in window)

  const handleShareRating = useCallback(async () => {
    if (rankings.length === 0) return
    setSharing(true)
    try {
      if (isMobileOrTablet) {
        // Mobile/tablet: generate image and use Web Share API
        const blob = await generateRatingImage(rankings, language, t)
        const file = new File([blob], "darts-rating.png", { type: "image/png" })
        if (typeof navigator !== "undefined" && "share" in navigator && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: language === "ru" ? "Рейтинг Дартс" : "Darts Rating" })
        } else {
          // Fallback: copy text
          const text = generateRatingText(rankings, language)
          await navigator.clipboard.writeText(text)
          setToast({ msg: t.ratingCopied, type: "ok" })
        }
      } else {
        // Desktop: copy formatted text to clipboard
        const text = generateRatingText(rankings, language)
        await navigator.clipboard.writeText(text)
        setToast({ msg: t.ratingCopied, type: "ok" })
      }
    } catch {
      // Silent fail
    } finally {
      setSharing(false)
    }
  }, [rankings, language, t, isMobileOrTablet])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="w-full max-w-lg bg-card border-border max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">{t.rating}</h2>
          </div>
          <div className="flex items-center gap-1">
            {/* Actions dropdown */}
            {!loading && !error && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground bg-transparent"
                    aria-label={t.actions}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[180px]">
                  {/* Share / Copy */}
                  {rankings.length > 0 && (
                    <>
                      <DropdownMenuItem
                        onClick={handleShareRating}
                        disabled={sharing}
                        className="gap-2"
                      >
                        {isMobileOrTablet
                          ? <Share2 className="w-4 h-4" />
                          : <Clipboard className="w-4 h-4" />
                        }
                        <span>{isMobileOrTablet ? t.shareRating : t.copyRating}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setShowRules(true)}
                        className="gap-2"
                      >
                        <Info className="w-4 h-4" />
                        <span>{t.ratingRulesTitle}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {/* Backup */}
                  <DropdownMenuItem
                    onClick={handleBackup}
                    disabled={backingUp || games.length === 0}
                    className="gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t.backupData}</span>
                  </DropdownMenuItem>
                  {/* Restore */}
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    disabled={restoring}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{t.restoreData}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {/* Hidden file input for restore */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-muted-foreground hover:text-foreground bg-transparent"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        {!loading && !error && games.length > 0 && (
          <div className="flex border-b border-border shrink-0">
            <button
              type="button"
              onClick={() => setTab("ranking")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "ranking"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.statsRanking}
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "history"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.statsByMonth}
            </button>
            <button
              type="button"
              onClick={() => setTab("elo")}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                tab === "elo"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.statsElo}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center py-8">{error}</p>
          )}

          {!loading && !error && games.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <Trophy className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">{t.noGamesYet}</p>
            </div>
          )}

          {/* Tab 1: Ranking */}
          {!loading && !error && games.length > 0 && tab === "ranking" && (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/50">
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">{t.playerName}</th>
                    <th className="text-center py-2 font-medium">{t.statsGames}</th>
                    <th className="text-center py-2 font-medium">{t.statsWins}</th>
                    <th className="text-center py-2 font-medium">%</th>
                    <th className="text-right py-2 font-medium">{t.avgPer3Darts}</th>
                    <th className="text-right py-2 font-medium">CO%</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r, i) => (
                    <tr key={r.name} className={`border-b border-border/20 ${i === 0 ? "text-primary" : "text-foreground"}`}>
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium truncate max-w-[100px]">{r.name}</td>
                      <td className="py-2 text-center">{r.gamesPlayed}</td>
                      <td className="py-2 text-center">{r.wins}</td>
                      <td className="py-2 text-center font-medium">{r.winPct.toFixed(1)}</td>
                      <td className="py-2 text-right font-medium">{r.avgPer3.toFixed(1)}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.checkoutPct !== null ? r.checkoutPct.toFixed(1) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 1.5: ELO Ranking */}
          {!loading && !error && games.length > 0 && tab === "elo" && (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/50">
                    <th className="text-left py-2 font-medium">#</th>
                    <th className="text-left py-2 font-medium">{t.playerName}</th>
                    <th className="text-center py-2 font-medium">{t.statsGames}</th>
                    <th className="text-center py-2 font-medium">{t.statsWins}</th>
                    <th className="text-center py-2 font-medium">{t.eloColumn || 'ELO'}</th>
                    <th className="text-center py-2 font-medium">%</th>
                    <th className="text-right py-2 font-medium">{t.avgPer3Darts}</th>
                    <th className="text-right py-2 font-medium">CO%</th>
                  </tr>
                </thead>
                <tbody>
                  {eloRankings.map((r, i) => (
                    <tr key={r.name} className={`border-b border-border/20 ${i === 0 ? "text-primary" : "text-foreground"}`}>
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium truncate max-w-[100px]">{r.name}</td>
                      <td className="py-2 text-center">{r.gamesPlayed}</td>
                      <td className="py-2 text-center">{r.wins}</td>
                      <td className="py-2 text-center font-medium">{r.elo}</td>
                      <td className="py-2 text-center font-medium">{r.winPct.toFixed(1)}</td>
                      <td className="py-2 text-right font-medium">{r.avgPer3.toFixed(1)}</td>
                      <td className="py-2 text-right text-muted-foreground">{r.checkoutPct !== null ? r.checkoutPct.toFixed(1) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Monthly history */}
          {!loading && !error && games.length > 0 && tab === "history" && (
            <div className="space-y-2">
              {monthGroups.map((group) => {
                const isExpanded = expandedMonths.has(group.sortKey)
                return (
                  <div key={group.sortKey} className="rounded-lg border border-border/50 overflow-hidden">
                    {/* Month header */}
                    <button
                      type="button"
                      onClick={() => toggleMonth(group.sortKey)}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">{group.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          ({group.games.length})
                        </span>
                      </div>
                      {isExpanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </button>

                    {/* Expanded games */}
                    {isExpanded && (
                      <div className="divide-y divide-border/30">
                        {group.games.map((game) => (
                          <GameCard key={game.id} game={game} t={t} language={language} formatDate={formatDate} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <Button
            variant="secondary"
            onClick={onClose}
            className="w-full h-9 text-sm bg-secondary text-secondary-foreground"
          >
            {t.close}
          </Button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg z-10 ${
            toast.type === "ok" ? "bg-primary/90 text-primary-foreground" : "bg-destructive/90 text-destructive-foreground"
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Rules Modal */}
        {showRules && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="bg-card border border-border rounded-lg p-5 mx-4 max-w-md space-y-4">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-primary shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">{t.ratingRulesTitle}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{t.ratingRulesText}</p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowRules(false)}
                  className="flex-1 h-9 text-sm bg-secondary text-secondary-foreground"
                >
                  {t.close}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Confirmation Dialog */}
        {showRestoreConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
            <div className="bg-card border border-border rounded-lg p-5 mx-4 max-w-sm space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <h3 className="text-sm font-semibold text-foreground">{t.restoreConfirmTitle}</h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.restoreConfirmMsg}</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleRestoreConfirm}
                  className="flex-1 h-9 text-sm"
                >
                  {t.restoreConfirm}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowRestoreConfirm(false); setPendingRestoreXml(null) }}
                  className="flex-1 h-9 text-sm bg-secondary text-secondary-foreground"
                >
                  {t.restoreCancel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

// ── Formatted text for clipboard (desktop) ──
function generateRatingText(
  rankings: { name: string; gamesPlayed: number; wins: number; winPct: number; avgPer3: number; checkoutPct: number | null }[],
  language: string,
): string {
  const isRu = language === "ru"
  const title = isRu ? "РЕЙТИНГ ДАРТС" : "DARTS PLAYER RATING"
  const date = new Date().toLocaleDateString(isRu ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric" })
  const header = isRu
    ? " #  Игрок          Игры Поб.  Win%  Ср/3   CO%"
    : " #  Player         Games Wins  Win%  Avg/3  CO%"
  const sep = "-".repeat(header.length)

  const rows = rankings.map((r, i) => {
    const pos = String(i + 1).padStart(2)
    const name = r.name.length > 14 ? r.name.substring(0, 13) + "." : r.name.padEnd(14)
    const games = String(r.gamesPlayed).padStart(isRu ? 4 : 5)
    const wins = String(r.wins).padStart(4)
    const pct = r.winPct.toFixed(1).padStart(5)
    const avg = r.avgPer3.toFixed(1).padStart(5)
    const co = (r.checkoutPct !== null ? r.checkoutPct.toFixed(1) : "-").padStart(5)
    return `${pos}. ${name} ${games} ${wins} ${pct} ${avg} ${co}`
  })

  return [title, date, "", header, sep, ...rows, sep].join("\n")
}

// ── Canvas image generator for rating table ──
interface RatingRow {
  name: string
  gamesPlayed: number
  wins: number
  winPct: number
  avgPer3: number
  checkoutPct: number | null
}

function generateRatingImage(
  rankings: RatingRow[],
  language: string,
  t: ReturnType<typeof useI18n>["t"],
): Promise<Blob> {
  const dpr = 2
  const W = 440 * dpr
  const pad = 20 * dpr
  const rowH = 28 * dpr
  const headerH = 70 * dpr
  const tableHeaderH = 30 * dpr
  const footerH = 40 * dpr
  const rows = rankings.length
  const H = headerH + tableHeaderH + rows * rowH + footerH + pad * 2

  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!

  // Background
  ctx.fillStyle = "#0f172a"
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = "#1e293b"
  ctx.fillRect(0, 0, W, headerH)
  ctx.fillStyle = "#f8fafc"
  ctx.font = `bold ${18 * dpr}px sans-serif`
  ctx.textAlign = "center"
  ctx.fillText(language === "ru" ? "РЕЙТИНГ ДАРТС" : "DARTS PLAYER RATING", W / 2, 30 * dpr)

  ctx.fillStyle = "#94a3b8"
  ctx.font = `${11 * dpr}px sans-serif`
  const dateStr = new Date().toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric" })
  ctx.fillText(dateStr, W / 2, 52 * dpr)

  // Column positions
  const colX = {
    pos: pad,
    name: pad + 28 * dpr,
    games: W / 2 - 20 * dpr,
    wins: W / 2 + 30 * dpr,
    pct: W / 2 + 90 * dpr,
    avg: W - pad - 70 * dpr,
    co: W - pad,
  }

  // Table header
  const tableY = headerH + pad / 2
  ctx.fillStyle = "#1e293b"
  ctx.fillRect(0, tableY, W, tableHeaderH)
  ctx.fillStyle = "#64748b"
  ctx.font = `bold ${10 * dpr}px sans-serif`
  ctx.textAlign = "left"
  ctx.fillText("#", colX.pos, tableY + 20 * dpr)
  ctx.fillText(language === "ru" ? "Игрок" : "Player", colX.name, tableY + 20 * dpr)
  ctx.textAlign = "right"
  ctx.fillText(language === "ru" ? "Игры" : "Games", colX.games, tableY + 20 * dpr)
  ctx.fillText(language === "ru" ? "Победы" : "Wins", colX.wins, tableY + 20 * dpr)
  ctx.fillText("Win%", colX.pct, tableY + 20 * dpr)
  ctx.fillText(language === "ru" ? "Ср/3" : "Avg/3", colX.avg, tableY + 20 * dpr)
  ctx.fillText("CO%", colX.co, tableY + 20 * dpr)

  // Table rows
  rankings.forEach((r, i) => {
    const y = tableY + tableHeaderH + i * rowH
    ctx.fillStyle = i % 2 === 0 ? "#0f172a" : "#131c31"
    ctx.fillRect(0, y, W, rowH)
    if (i === 0) {
      ctx.fillStyle = "rgba(74, 222, 128, 0.08)"
      ctx.fillRect(0, y, W, rowH)
    }
    const textY = y + 19 * dpr

    ctx.fillStyle = i === 0 ? "#4ade80" : "#94a3b8"
    ctx.font = `bold ${11 * dpr}px sans-serif`
    ctx.textAlign = "left"
    ctx.fillText(`${i + 1}.`, colX.pos, textY)

    ctx.fillStyle = i === 0 ? "#f8fafc" : "#cbd5e1"
    ctx.font = `${11 * dpr}px sans-serif`
    const displayName = r.name.length > 12 ? `${r.name.substring(0, 11)}.` : r.name
    ctx.fillText(displayName, colX.name, textY)

    ctx.textAlign = "right"
    ctx.fillStyle = "#cbd5e1"
    ctx.fillText(`${r.gamesPlayed}`, colX.games, textY)
    ctx.fillText(`${r.wins}`, colX.wins, textY)

    ctx.fillStyle = i === 0 ? "#4ade80" : "#f8fafc"
    ctx.font = `bold ${11 * dpr}px sans-serif`
    ctx.fillText(r.winPct.toFixed(1), colX.pct, textY)
    ctx.fillText(r.avgPer3.toFixed(1), colX.avg, textY)

    ctx.fillStyle = "#cbd5e1"
    ctx.font = `${11 * dpr}px sans-serif`
    ctx.fillText(r.checkoutPct !== null ? r.checkoutPct.toFixed(1) : "-", colX.co, textY)
  })

  // Footer
  const footerY = tableY + tableHeaderH + rows * rowH + 10 * dpr
  ctx.fillStyle = "#475569"
  ctx.font = `${9 * dpr}px sans-serif`
  ctx.textAlign = "center"
  ctx.fillText("Darts App", W / 2, footerY + 12 * dpr)

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png")
  })
}

function GameCard({ game, t, language, formatDate }: {
  game: SavedGame
  t: ReturnType<typeof useI18n>["t"]
  language: string
  formatDate: (ts: { seconds: number } | null) => string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="px-3 py-2.5 space-y-1.5">
      {/* Row: date + mode + winner */}
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(game.timestamp)}</span>
            <span className="px-1.5 py-0.5 bg-primary/15 text-primary rounded text-[10px] font-medium shrink-0">
              {game.gameMode} {game.finishMode === "double" ? "D" : "S"}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Trophy className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium text-primary truncate max-w-[80px]">{game.winner}</span>
            {expanded
              ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
              : <ChevronRight className="w-3 h-3 text-muted-foreground" />
            }
          </div>
        </div>
      </button>

      {/* Expanded: full player stats */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-0.5 font-medium">{t.playerName}</th>
                <th className="text-right py-0.5 font-medium">{t.avgPer3Darts}</th>
                <th className="text-right py-0.5 font-medium">{t.dartsThrown}</th>
                <th className="text-right py-0.5 font-medium">{t.busts}</th>
                <th className="text-right py-0.5 font-medium">CO%</th>
                {game.legsPlayed > 1 && (
                  <th className="text-right py-0.5 font-medium">{t.legsHeader}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {game.players.map((p, i) => (
                <tr key={i} className={p.name === game.winner ? "text-primary" : "text-foreground"}>
                  <td className="py-0.5 truncate max-w-[80px]">{p.name}</td>
                  <td className="py-0.5 text-right font-medium">{p.average.toFixed(1)}</td>
                  <td className="py-0.5 text-right">{p.totalDarts}</td>
                  <td className="py-0.5 text-right text-muted-foreground">{p.busts}</td>
                  <td className="py-0.5 text-right text-muted-foreground">{p.checkoutPct != null ? `${p.checkoutPct.toFixed(1)}` : "-"}</td>
                  {game.legsPlayed > 1 && (
                    <td className="py-0.5 text-right">{p.legsWon}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
