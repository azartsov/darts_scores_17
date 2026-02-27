"use client"

import { useState } from "react"
import type { Player, FinishMode, GameType, TotalLegs } from "@/lib/game-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n/context"
import { LanguageSwitcher } from "./language-switcher"
import { GameStatistics } from "./game-statistics"
import { StatsModal } from "./stats-modal"
import { useAuth } from "@/lib/auth-context"
import { BarChart3, Trophy, RotateCcw, Home, Cloud, Loader2, AlertCircle } from "lucide-react"

interface VictoryScreenProps {
  winner: Player
  players: Player[]
  gameType: GameType
  finishMode: FinishMode
  totalLegs: TotalLegs
  currentLeg: number
  onRematch: () => void
  onNewGame: () => void
  saveStatus?: "idle" | "saving" | "saved" | "error"
}

export function VictoryScreen({ winner, players, gameType, finishMode, totalLegs, currentLeg, onRematch, onNewGame, saveStatus = "idle" }: VictoryScreenProps) {
  const { t, formatString, language } = useI18n()
  const { user } = useAuth()
  const isMultiLeg = totalLegs > 1
  const [showStatsModal, setShowStatsModal] = useState(false)
  const statsUserId = user?.uid ?? winner.id

  const finishMessage = finishMode === "double" 
    ? formatString(t.finishedInTurnsDouble, { turns: winner.history.length })
    : formatString(t.finishedInTurnsSimple, { turns: winner.history.length })

  const formatDate = (ts: { seconds: number } | null) => {
    if (!ts) return "-"
    const d = new Date(ts.seconds * 1000)
    return d.toLocaleDateString(language === "ru" ? "ru-RU" : "en-US", {
      day: "2-digit", month: "2-digit",
    }) + " " + d.toLocaleTimeString(language === "ru" ? "ru-RU" : "en-US", {
      hour: "2-digit", minute: "2-digit",
    })
  }

  // Build a lightweight SavedGame-like object from current match state
  const makeSavedGame = () => {
    const startingScore = gameType === 301 ? 301 : 501
    const playersStats = players.map((p) => {
      const totalDarts = p.history.reduce((sum, h) => sum + (h.dartsActuallyThrown || 3), 0)
      const totalPoints = p.history.reduce((sum, h) => sum + (h.wasBust ? 0 : h.total), 0)
      const avg = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : 0
      const busts = p.history.filter((h) => h.wasBust).length

      // Compute checkout percentage similar to saveGameToFirestore
      let checkoutAttempts = 0
      let checkoutSuccesses = 0
      let runningScore = startingScore
      for (const h of p.history) {
        if (runningScore <= 170 && runningScore >= 2) {
          checkoutAttempts++
          if (!h.wasBust && h.scoreAfter === 0) checkoutSuccesses++
        }
        runningScore = h.scoreAfter
      }

      return {
        name: p.name,
        legsWon: p.legsWon,
        average: Math.round(avg * 100) / 100,
        totalDarts,
        remaining: p.currentScore,
        busts,
        checkoutPct: checkoutAttempts > 0 ? Math.round((checkoutSuccesses / checkoutAttempts) * 1000) / 10 : null,
      }
    })

    return {
      id: "local",
      userId: user?.uid ?? "",
      timestamp: null,
      gameMode: String(gameType),
      finishMode,
      legsPlayed: totalLegs,
      winner: winner.name,
      players: playersStats,
    }
  }

  // Compute pairwise ELO deltas for this single match using players' current ratings (if present)
  const computeDeltasForLocal = () => {
    const K = 32
    const nameToRating: Record<string, number> = {}
    players.forEach(p => { nameToRating[p.name] = p.rating ?? 1500 })
    const deltas: { player: string; delta: number; against: string }[] = []
    const winnerName = winner.name
    const opponents = players.filter(p => p.name !== winnerName)
    for (const opp of opponents) {
      const winnerElo = nameToRating[winnerName] ?? 1500
      const oppElo = nameToRating[opp.name] ?? 1500
      const expectedWinner = 1 / (1 + Math.pow(10, (oppElo - winnerElo) / 400))
      const expectedOpp = 1 - expectedWinner
      const winDelta = Math.round(K * (1 - expectedWinner))
      const oppDelta = Math.round(-K * expectedOpp)
      deltas.push({ player: winnerName, delta: winDelta, against: opp.name })
      deltas.push({ player: opp.name, delta: oppDelta, against: winnerName })
    }
    return deltas
  }

  const localSavedGame = makeSavedGame()
  const localRatingDeltas = computeDeltasForLocal()

  function LocalGameCard({ game }: { game: any }) {
    const eloDeltas: Record<string, number> = {}
    localRatingDeltas.forEach(({ player, delta }) => { eloDeltas[player] = (eloDeltas[player] || 0) + delta })

    return (
      <div className="px-2 py-1.5 text-left">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-0.5 font-medium">{t.playerName}</th>
                <th className="text-right py-0.5 font-medium">{t.remainingPoints}</th>
                <th className="text-right py-0.5 font-medium">{t.avgPer3Darts}</th>
                <th className="text-right py-0.5 font-medium">{t.dartsThrown}</th>
                <th className="text-right py-0.5 font-medium">{t.busts}</th>
                <th className="text-right py-0.5 font-medium">CO%</th>
                <th className="text-right py-0.5 font-medium">{t.eloDelta || "ELO Δ"}</th>
                {game.legsPlayed > 1 && (
                  <th className="text-right py-0.5 font-medium">{t.legsHeader}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {game.players.map((p: any, i: number) => {
                const eloDelta = eloDeltas[p.name] || 0
                const isWinner = p.name === game.winner
                return (
                  <tr key={i} className={isWinner ? "text-primary" : "text-foreground"}>
                    <td className="py-0.5 truncate max-w-[80px]">{p.name}</td>
                    <td className="py-0.5 text-right font-medium">{p.remaining}</td>
                    <td className="py-0.5 text-right font-medium">{p.average.toFixed(1)}</td>
                    <td className="py-0.5 text-right">{p.totalDarts}</td>
                    <td className="py-0.5 text-right text-muted-foreground">{p.busts}</td>
                    <td className="py-0.5 text-right text-muted-foreground">{p.checkoutPct != null ? `${p.checkoutPct.toFixed(1)}` : "-"}</td>
                    <td className={`py-0.5 text-right font-medium ${eloDelta > 0 ? "text-green-500" : eloDelta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {eloDelta > 0 ? "+" : ""}{eloDelta}
                    </td>
                    {game.legsPlayed > 1 && (
                      <td className="py-0.5 text-right">{p.legsWon}</td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full bg-background flex items-center justify-center p-3 relative">
      {/* Language Switcher */}
      <div className="absolute top-3 right-3 z-10">
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-sm bg-card border-border text-center">
        <CardContent className="pt-6 pb-4 space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center animate-pulse">
              <Trophy className="w-8 h-8 text-accent-foreground" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              {isMultiLeg ? t.matchWinner : t.winner}
            </h1>
            <p className="text-lg text-primary font-medium">{winner.name}</p>
          </div>

          {isMultiLeg && (
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-sm text-muted-foreground">{t.legs}:</span>
              <span className="text-lg font-bold text-foreground">{winner.legsWon}/{totalLegs}</span>
            </div>
          )}

          {/* Replace simple finish text with a compact per-match summary */}
          <div className="text-sm text-muted-foreground">
            <LocalGameCard game={localSavedGame} />
          </div>

          {/* Cloud save indicator (only show saving or error, omit "saved" message) */}
          {saveStatus === "saving" && (
            <div className="flex items-center justify-center gap-1.5 text-xs">
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Saving...</span>
            </div>
          )}
          {saveStatus === "error" && (
            <div className="flex items-center justify-center gap-1.5 text-xs">
              <AlertCircle className="w-3 h-3 text-destructive" />
              <span className="text-destructive">Save failed</span>
            </div>
          )}

          {/* Legs progress */}
          {isMultiLeg && (
            <div className="flex items-center justify-center gap-3 py-2">
              {players.map((player) => (
                <div key={player.id} className="text-center">
                  <div className="text-xs text-muted-foreground truncate max-w-[80px]">{player.name}</div>
                  <div className={`text-lg font-bold ${
                    player.id === winner.id ? "text-primary" : "text-foreground/50"
                  }`}>
                    {player.legsWon}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Match statistics shown immediately */}
          <GameStatistics
            players={players}
            gameType={gameType}
            finishMode={finishMode}
            winner={winner}
            totalLegs={totalLegs}
            currentLeg={currentLeg}
            autoOpen
            hideTrigger
          />

          {/* Button to open overall statistics modal */}
          <Button
            variant="secondary"
            className="h-10 bg-secondary text-secondary-foreground text-sm mt-2"
            onClick={() => setShowStatsModal(true)}
          >
            <BarChart3 className="w-4 h-4 mr-1.5" />
            {t.viewStats}
          </Button>
          {showStatsModal && (
            <StatsModal userId={statsUserId} onClose={() => setShowStatsModal(false)} />
          )}

          

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="secondary" className="h-10 bg-secondary text-secondary-foreground text-sm" onClick={onRematch}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              {t.rematch}
            </Button>
            <Button className="h-10 bg-primary text-primary-foreground text-sm" onClick={onNewGame}>
              <Home className="w-3.5 h-3.5 mr-1.5" />
              {t.newGame}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
