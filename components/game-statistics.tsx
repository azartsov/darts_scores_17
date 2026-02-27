"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useI18n } from "@/lib/i18n/context"
import type { Player, GameType, FinishMode, TotalLegs } from "@/lib/game-types"
import { BarChart3, Share2, Info, Loader2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { fetchUserGames, computeEloRatings } from "@/lib/game-firestore"

interface GameStatisticsProps {
  players: Player[]
  gameType: GameType
  finishMode: FinishMode
  winner: Player
  totalLegs: TotalLegs
  currentLeg: number
  /**
   * if true, the statistics dialog will open automatically on mount
   */
  autoOpen?: boolean
  /**
   * hide the trigger button; only useful when autoOpen or when parent handles opening
   */
  hideTrigger?: boolean
}

interface PlayerStats {
  player: Player
  totalDarts: number
  totalPointsScored: number
  avgPer3Darts: number
  totalRounds: number
  bustRounds: number
  position: number
  eloDelta: number
}

export function GameStatistics({ players, gameType, finishMode, winner, totalLegs, currentLeg, autoOpen, hideTrigger }: GameStatisticsProps) {
  const { t, language } = useI18n()
  const [open, setOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [canShareFiles, setCanShareFiles] = useState(false)

  const { user } = useAuth()
  const [historicalRatings, setHistoricalRatings] = useState<Record<string, number>>({})

  // load historical ratings if user is signed in
  useEffect(() => {
    if (!user) return
    fetchUserGames(user.uid, 1000)
      .then((games) => {
        const map = computeEloRatings(games)
        setHistoricalRatings(map)
      })
      .catch(() => {
        // ignore failures, just keep map empty (defaults will apply)
      })
  }, [user])

  useEffect(() => {
    const hasFileShare =
      typeof navigator !== "undefined" &&
      "share" in navigator &&
      "canShare" in navigator
    setCanShareFiles(hasFileShare)
  }, [])

  const isMultiLeg = totalLegs > 1

  // Calculate ELO deltas
  const calculateEloDeltas = (): Record<string, number> => {
    const K = 32
    const deltas: Record<string, number> = {}
    
    if (players.length === 0) return deltas
    
    // Winner vs each opponent (pairwise updates)
    const opponents = players.filter(p => p.id !== winner.id)
    
    for (const opponent of opponents) {
      // determine ratings: prefer live value, then historical lookup, then 1500
      const winnerElo =
        winner.rating ?? historicalRatings[winner.name] ?? 1500
      const opponentElo =
        opponent.rating ?? historicalRatings[opponent.name] ?? 1500

      // Expected score for winner
      const expectedWinner = 1 / (1 + Math.pow(10, (opponentElo - winnerElo) / 400))
      const expectedOpponent = 1 - expectedWinner

      // Winner gets +K * (1 - expectedWinner)
      deltas[winner.id] = (deltas[winner.id] || 0) + K * (1 - expectedWinner)

      // Opponent loses K * expectedOpponent (not K * expectedWinner)
      deltas[opponent.id] = (deltas[opponent.id] || 0) - K * expectedOpponent
    }
    
    // Round to nearest integer
    Object.keys(deltas).forEach(id => {
      deltas[id] = Math.round(deltas[id])
    })
    
    return deltas
  }

  const eloDeltas = calculateEloDeltas()

  // Calculate statistics
  const calculateStats = (): PlayerStats[] => {
    const stats = players.map((player) => {
      let totalDarts = 0
      let totalPointsScored = 0
      let totalRounds = 0
      let bustRounds = 0

      player.history.forEach((turn) => {
        totalRounds++
        const dartsInTurn = turn.dartsActuallyThrown ?? 3
        totalDarts += dartsInTurn

        if (turn.wasBust) {
          bustRounds++
        } else {
          totalPointsScored += turn.total
        }
      })

      const avgPer3Darts = totalDarts > 0 ? (totalPointsScored / totalDarts) * 3 : 0

      return {
        player,
        totalDarts,
        totalPointsScored,
        avgPer3Darts,
        totalRounds,
        bustRounds,
        position: 0,
        eloDelta: eloDeltas[player.id] || 0,
      }
    })

    stats.sort((a, b) => {
      // For multi-leg: sort by win percentage (legs won / total legs), then by avg/3
      if (isMultiLeg) {
        const winPercentA = a.player.legsWon / totalLegs
        const winPercentB = b.player.legsWon / totalLegs
        
        if (Math.abs(winPercentA - winPercentB) > 0.0001) {
          return winPercentB - winPercentA // Higher win percentage first
        }
        // If win percentages are equal, sort by avg/3
        return b.avgPer3Darts - a.avgPer3Darts
      }
      
      // For single leg: sort by remaining score (ascending), then by avg/3 (descending)
      if (a.player.currentScore !== b.player.currentScore) {
        return a.player.currentScore - b.player.currentScore
      }
      return b.avgPer3Darts - a.avgPer3Darts
    })

    stats.forEach((stat, index) => { stat.position = index + 1 })
    return stats
  }

  const stats = calculateStats()

  // Generate statistics image using canvas
  const generateStatsImage = useCallback(async (): Promise<Blob> => {
    const dpr = 2
    const W = 420 * dpr
    const pad = 20 * dpr
    const rowH = 28 * dpr
    const headerH = 80 * dpr
    const footerH = 50 * dpr
    const tableHeaderH = 30 * dpr
    const rows = stats.length
    const H = headerH + tableHeaderH + rows * rowH + footerH + pad * 2

    const canvas = document.createElement("canvas")
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext("2d")!

    // Background
    ctx.fillStyle = "#0f172a"
    ctx.fillRect(0, 0, W, H)

    // Header area
    ctx.fillStyle = "#1e293b"
    ctx.fillRect(0, 0, W, headerH)

    // Title
    ctx.fillStyle = "#f8fafc"
    ctx.font = `bold ${18 * dpr}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText("DART STATISTICS", W / 2, 30 * dpr)

    // Game info line
    ctx.fillStyle = "#94a3b8"
    ctx.font = `${11 * dpr}px sans-serif`
    const modeLabel = finishMode === "double" ? "Double Out" : "Simple"
    const dateStr = new Date().toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "2-digit", year: "numeric" })
    const timeStr = new Date().toLocaleTimeString(language === "ru" ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })
    const infoLine = isMultiLeg
      ? `${gameType} | ${modeLabel} | Legs: ${totalLegs} | ${dateStr} ${timeStr}`
      : `${gameType} | ${modeLabel} | ${dateStr} ${timeStr}`
    ctx.fillText(infoLine, W / 2, 52 * dpr)

    // Winner line
    ctx.fillStyle = "#4ade80"
    ctx.font = `bold ${12 * dpr}px sans-serif`
    ctx.fillText(`Winner: ${winner.name}`, W / 2, 70 * dpr)

    // Table columns
    const colX = {
      pos: pad,
      name: pad + 28 * dpr,
      extra: W - pad - 260 * dpr,
      avg: W - pad - 180 * dpr,
      darts: W - pad - 110 * dpr,
      busts: W - pad - 50 * dpr,
      elo: W - pad,
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
    ctx.fillText(isMultiLeg ? (language === "ru" ? "Леги" : "Legs") : (language === "ru" ? "Ост." : "Rem"), colX.extra, tableY + 20 * dpr)
    ctx.fillText(language === "ru" ? "Ср/3" : "Avg/3", colX.avg, tableY + 20 * dpr)
    ctx.fillText(language === "ru" ? "Броски" : "Darts", colX.darts, tableY + 20 * dpr)
    ctx.fillText(language === "ru" ? "Перебр." : "Busts", colX.busts, tableY + 20 * dpr)
    ctx.fillText("ELO Δ", colX.elo, tableY + 20 * dpr)

    // Table rows
    stats.forEach((stat, i) => {
      const y = tableY + tableHeaderH + i * rowH

      ctx.fillStyle = i % 2 === 0 ? "#0f172a" : "#131c31"
      ctx.fillRect(0, y, W, rowH)

      if (stat.position === 1) {
        ctx.fillStyle = "rgba(74, 222, 128, 0.08)"
        ctx.fillRect(0, y, W, rowH)
      }

      const textY = y + 19 * dpr

      ctx.fillStyle = stat.position === 1 ? "#4ade80" : "#94a3b8"
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.textAlign = "left"
      ctx.fillText(`${stat.position}.`, colX.pos, textY)

      ctx.fillStyle = stat.position === 1 ? "#f8fafc" : "#cbd5e1"
      ctx.font = `${11 * dpr}px sans-serif`
      const displayName = stat.player.name.length > 12 ? `${stat.player.name.substring(0, 11)}.` : stat.player.name
      ctx.fillText(displayName, colX.name, textY)

      ctx.textAlign = "right"
      ctx.fillStyle = "#cbd5e1"
      ctx.fillText(isMultiLeg ? `${stat.player.legsWon}/${totalLegs}` : `${stat.player.currentScore}`, colX.extra, textY)

      ctx.fillStyle = stat.position === 1 ? "#4ade80" : "#f8fafc"
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.fillText(stat.avgPer3Darts.toFixed(1), colX.avg, textY)

      ctx.fillStyle = "#cbd5e1"
      ctx.fillText(`${stat.totalDarts}`, colX.darts, textY)

      ctx.fillStyle = stat.bustRounds > 0 ? "#f87171" : "#475569"
      ctx.fillText(`${stat.bustRounds}`, colX.busts, textY)
      
      // ELO Delta with color coding
      const eloDelta = stat.eloDelta
      if (eloDelta > 0) {
        ctx.fillStyle = "#4ade80" // Green for positive
      } else if (eloDelta < 0) {
        ctx.fillStyle = "#f87171" // Red for negative
      } else {
        ctx.fillStyle = "#94a3b8" // Gray for zero
      }
      ctx.font = `bold ${11 * dpr}px sans-serif`
      ctx.fillText(`${eloDelta > 0 ? "+" : ""}${eloDelta}`, colX.elo, textY)
    })

    // Footer
    const footerY = tableY + tableHeaderH + rows * rowH + 10 * dpr
    ctx.fillStyle = "#475569"
    ctx.font = `${9 * dpr}px sans-serif`
    ctx.textAlign = "center"
    ctx.fillText("Avg/3 = (Points / Darts) x 3  |  Busts included (0 pts)", W / 2, footerY + 12 * dpr)

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png")
    })
  }, [stats, gameType, finishMode, winner, totalLegs, isMultiLeg, language])

  // Single share handler
  const handleShare = async () => {
    setSharing(true)
    try {
      const blob = await generateStatsImage()
      const file = new File([blob], "darts-stats.png", { type: "image/png" })

      if (canShareFiles && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Darts ${gameType} Statistics` })
        setSharing(false)
        return
      }

      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        setSharing(false)
        return
      } catch {
        // Clipboard write not supported
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `darts-stats-${gameType}-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Silent fail
    } finally {
      setSharing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="secondary" className="h-10 bg-secondary text-secondary-foreground text-sm">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            {t.viewStats}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="bg-card border-border max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-foreground flex items-center gap-2 text-base">
            <BarChart3 className="w-4 h-4 text-primary" />
            {t.statistics}
          </DialogTitle>
        </DialogHeader>

        {/* Game Info */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 flex-wrap">
          <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded text-[11px]">{gameType}</span>
          <span className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-[11px]">
            {finishMode === "double" ? t.finishDouble : t.finishSimple}
          </span>
          {isMultiLeg && (
            <span className="px-1.5 py-0.5 bg-accent/20 text-accent rounded text-[11px]">
              {t.legs}: {totalLegs}
            </span>
          )}
          <span className="text-[11px]">{players.length} {t.players}</span>
        </div>

        {/* Statistics Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t.position}</th>
                <th className="text-left py-1.5 px-1 text-muted-foreground font-medium">{t.playerName}</th>
                {isMultiLeg && <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.legsHeader}</th>}
                <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.remainingPoints}</th>
                <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.avgPer3Darts}</th>
                <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.dartsThrown}</th>
                <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.busts}</th>
                <th className="text-right py-1.5 px-1 text-muted-foreground font-medium">{t.eloDelta || "ELO Δ"}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => {
                const eloDelta = stat.eloDelta
                const eloColor = eloDelta > 0 ? "text-green-500" : eloDelta < 0 ? "text-red-500" : "text-muted-foreground"
                return (
                  <tr key={stat.player.id} className={`border-b border-border/50 ${stat.position === 1 ? "bg-primary/10" : ""}`}>
                    <td className="py-1.5 px-1 text-foreground font-medium">{stat.position}</td>
                    <td className="py-1.5 px-1 text-foreground truncate max-w-[80px]">
                      {stat.player.name}
                      {stat.position === 1 && <span className="ml-0.5 text-primary">*</span>}
                    </td>
                    {isMultiLeg && <td className="py-1.5 px-1 text-right text-foreground font-medium">{stat.player.legsWon}/{totalLegs}</td>}
                    <td className="py-1.5 px-1 text-right text-foreground">{stat.player.currentScore}</td>
                    <td className="py-1.5 px-1 text-right text-foreground font-medium">{stat.avgPer3Darts.toFixed(1)}</td>
                    <td className="py-1.5 px-1 text-right text-foreground">{stat.totalDarts}</td>
                    <td className="py-1.5 px-1 text-right text-muted-foreground">{stat.bustRounds}</td>
                    <td className={`py-1.5 px-1 text-right font-medium ${eloColor}`}>{eloDelta > 0 ? "+" : ""}{eloDelta}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Stats Notes */}
        <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5">
          <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{t.avgCalculationHint}</span>
          </div>
          <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>{t.bustIncludedHint}</span>
          </div>
        </div>

        {/* Share + Close */}
        <div className="flex gap-2 mt-3">
          <Button
            className="flex-1 h-10 text-sm bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleShare}
            disabled={sharing}
          >
            {sharing ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />{t.generatingImage}</>
            ) : (
              <><Share2 className="w-4 h-4 mr-1.5" />{t.shareStats}</>
            )}
          </Button>
          <Button
            variant="secondary"
            className="h-10 px-6 text-sm bg-secondary text-secondary-foreground"
            onClick={() => setOpen(false)}
          >
            {t.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
