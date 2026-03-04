"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { GameSetup } from "@/components/game-setup"
import { GameBoard } from "@/components/game-board"
import { VictoryScreen } from "@/components/victory-screen"
import { LegTransition } from "@/components/leg-transition"
import { LoginScreen } from "@/components/login-screen"
import { UserInfoBar } from "@/components/user-info-bar"
import { LaunchSplash } from "@/components/launch-splash"
import type { GameState, Player, GameType, DartInput, FinishMode, TotalLegs } from "@/lib/game-types"
import { saveGameState, loadGameState, clearGameState } from "@/lib/game-storage"
import { useAuth } from "@/lib/auth-context"
import { saveGameToFirestore, fetchUserGames, computeEloRatings } from "@/lib/game-firestore"
import { useI18n } from "@/lib/i18n/context"
import { applyTurn } from "@/lib/game-engine"

const initialGameState: GameState = {
  phase: "setup",
  gameType: 501,
  finishMode: "double",
  totalLegs: 1,
  currentLeg: 1,
  players: [],
  activePlayerIndex: 0,
  winner: null,
  legWinner: null,
  startTime: Date.now(),
}

export default function DartMasterPro() {
  const { user, isGuest, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [undoStack, setUndoStack] = useState<GameState[]>([])
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [showLaunchSplash, setShowLaunchSplash] = useState(true)
  const savedGameRef = useRef(false)

  // Show login screen if not authenticated and not guest
  const isAuthenticated = !!user || isGuest

  // Load game state from session storage on mount
  useEffect(() => {
    const saved = loadGameState()
    if (saved) {
      if (!saved.finishMode) {
        saved.finishMode = "double"
      }
      if (!saved.totalLegs) {
        saved.totalLegs = 1
      }
      if (!saved.currentLeg) {
        saved.currentLeg = 1
      }
      if (!saved.startTime) {
        saved.startTime = Date.now()
      }
      // Ensure players have legsWon and rating
      saved.players = saved.players.map(p => ({
        ...p,
        legsWon: p.legsWon ?? 0,
        rating: p.rating ?? 1500,
      }))
      setGameState(saved)
    }
  }, [])

  // Save game state whenever it changes
  useEffect(() => {
    if (gameState.phase !== "setup") {
      saveGameState(gameState)
    }
  }, [gameState])

  // Auto-save to Firestore when game finishes (logged-in users only)
  useEffect(() => {
    if (gameState.phase === "finished" && user && !savedGameRef.current) {
      savedGameRef.current = true
      setSaveStatus("saving")
      saveGameToFirestore(
        user.uid,
        gameState.players,
        gameState.gameType,
        gameState.finishMode,
        gameState.totalLegs,
      )
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"))
    }
  }, [gameState.phase, gameState.players, gameState.gameType, gameState.finishMode, gameState.totalLegs, user])

  // internal version that assumes players already have ratings assigned
  const handleStartGame = useCallback((players: Player[], gameType: GameType, finishMode: FinishMode, totalLegs: TotalLegs) => {
    savedGameRef.current = false
    setSaveStatus("idle")
    const newState: GameState = {
      phase: "playing",
      gameType,
      finishMode,
      totalLegs,
      currentLeg: 1,
      players,
      activePlayerIndex: 0,
      winner: null,
      legWinner: null,
      startTime: Date.now(),
    }
    setGameState(newState)
    setUndoStack([])
  }, [])

  // wrapper used by <GameSetup> to enrich players with stored ratings
  const handleStartGameWithRatings = useCallback(async (
    players: Player[],
    gameType: GameType,
    finishMode: FinishMode,
    totalLegs: TotalLegs
  ) => {
    let ratedPlayers = players.map((p) => ({ ...p, rating: 1500 }))
    if (user && user.uid) {
      try {
        const history = await fetchUserGames(user.uid, 1000)
        const ratingsMap = computeEloRatings(history)
        ratedPlayers = ratedPlayers.map((p) => ({
          ...p,
          rating: ratingsMap[p.name] ?? 1500,
        }))
      } catch {
        // network failure should not block game start; fall back to defaults
      }
    }
    handleStartGame(ratedPlayers, gameType, finishMode, totalLegs)
  }, [user, handleStartGame])

  const handleSubmitTurn = useCallback((darts: [number, number, number], dartDetails: [DartInput, DartInput, DartInput]) => {
    setGameState((prev) => {
      setUndoStack((stack) => [...stack.slice(-9), prev])
      return applyTurn(prev, darts, dartDetails)
    })
  }, [])

  const handleNextLeg = useCallback(() => {
    setGameState((prev) => {
      const nextLeg = prev.currentLeg + 1
      
      // Reset player scores for new leg, keep history and legsWon
      const resetPlayers = prev.players.map((player) => ({
        ...player,
        currentScore: player.startingScore,
      }))

      return {
        ...prev,
        phase: "playing" as const,
        currentLeg: nextLeg,
        players: resetPlayers,
        activePlayerIndex: 0,
        legWinner: null,
      }
    })
    setUndoStack([])
  }, [])

  const handleUndo = useCallback(() => {
    const prevState = undoStack[undoStack.length - 1]
    if (prevState) {
      setGameState(prevState)
      setUndoStack((stack) => stack.slice(0, -1))
    }
  }, [undoStack])

  const handleNewGame = useCallback(() => {
    clearGameState()
    savedGameRef.current = false
    setSaveStatus("idle")
    setGameState(initialGameState)
    setUndoStack([])
  }, [])

  const handleResetGame = useCallback(() => {
    savedGameRef.current = false
    setSaveStatus("idle")
    setGameState((prev) => ({
      ...prev,
      phase: "playing" as const,
      currentLeg: 1,
      activePlayerIndex: 0,
      winner: null,
      legWinner: null,
      startTime: Date.now(),
      players: prev.players.map((player) => ({
        ...player,
        currentScore: player.startingScore,
        history: [],
        legsWon: 0,
      })),
    }))
    setUndoStack([])
  }, [])

  // Loading state
  if (showLaunchSplash) {
    return <LaunchSplash onComplete={() => setShowLaunchSplash(false)} />
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Login screen
  if (!isAuthenticated) {
    return <LoginScreen />
  }

  // Save status toast
  const saveToast = saveStatus === "saved" ? t.gameSaved :
                    saveStatus === "error" ? t.gameSaveError : null

  // Render based on game phase
  if (gameState.phase === "setup") {
    return (
      <div className="flex flex-col min-h-screen">
        <UserInfoBar />
        <div className="flex-1">
          <GameSetup onStartGame={handleStartGameWithRatings} />
        </div>
      </div>
    )
  }

  if (gameState.phase === "legFinished" && gameState.legWinner) {
    return (
      <div className="flex flex-col min-h-screen">
        <UserInfoBar />
        <div className="flex-1 flex items-center justify-center">
          <LegTransition
            legWinner={gameState.legWinner}
            players={gameState.players}
            currentLeg={gameState.currentLeg}
            totalLegs={gameState.totalLegs}
            gameType={gameState.gameType}
            finishMode={gameState.finishMode}
            onNextLeg={handleNextLeg}
            onNewGame={handleNewGame}
          />
        </div>
      </div>
    )
  }

  if (gameState.phase === "finished" && gameState.winner) {
    return (
      <div className="flex flex-col min-h-screen">
        <UserInfoBar />
        <div className="flex-1 flex items-center justify-center">
          <VictoryScreen 
            winner={gameState.winner} 
            players={gameState.players}
            gameType={gameState.gameType}
            finishMode={gameState.finishMode}
            totalLegs={gameState.totalLegs}
            currentLeg={gameState.currentLeg}
            onRematch={handleResetGame} 
            onNewGame={handleNewGame}
            saveStatus={saveStatus}
          />
        </div>
        {/* Save toast: compact single-line text (no large button-like background) */}
        {saveToast && (
          <div className={`fixed bottom-2 left-1/2 -translate-x-1/2 z-50 text-xs ${saveStatus === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {saveToast}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <UserInfoBar />
      <GameBoard
        players={gameState.players}
        activePlayerIndex={gameState.activePlayerIndex}
        gameType={gameState.gameType}
        finishMode={gameState.finishMode}
        totalLegs={gameState.totalLegs}
        currentLeg={gameState.currentLeg}
        onSubmitTurn={handleSubmitTurn}
        onUndo={handleUndo}
        onNewGame={handleNewGame}
        onResetGame={handleResetGame}
        canUndo={undoStack.length > 0}
      />
    </>
  )
}
