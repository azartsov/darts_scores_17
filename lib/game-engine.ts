import type { DartInput, GameState, TurnHistory } from "./game-types"

function getLastScoringDart(dartDetails: [DartInput, DartInput, DartInput]): DartInput | null {
  for (let i = dartDetails.length - 1; i >= 0; i--) {
    const dart = dartDetails[i]
    if (dart && dart.state === "scored" && dart.value !== null && dart.value > 0) {
      return dart
    }
  }
  return null
}

function didDoubleOut(
  dartDetails: [DartInput, DartInput, DartInput],
): boolean {
  const lastDart = getLastScoringDart(dartDetails)
  if (!lastDart || lastDart.value === null) return false
  return lastDart.multiplier === 2 || lastDart.value === 50
}

function resolveBustAndWin(
  finishMode: GameState["finishMode"],
  newScore: number,
  dartDetails: [DartInput, DartInput, DartInput],
): { isBust: boolean; isWin: boolean } {
  if (finishMode === "simple") {
    const isBust = newScore < 0
    return { isBust, isWin: newScore === 0 && !isBust }
  }

  // double-out
  if (newScore < 0 || newScore === 1) {
    return { isBust: true, isWin: false }
  }

  if (newScore === 0) {
    const isWin = didDoubleOut(dartDetails)
    return { isBust: !isWin, isWin }
  }

  return { isBust: false, isWin: false }
}

export function applyTurn(
  prev: GameState,
  darts: [number, number, number],
  dartDetails: [DartInput, DartInput, DartInput],
): GameState {
  const activePlayer = prev.players[prev.activePlayerIndex]
  const totalScore = darts.reduce((sum, d) => sum + d, 0)
  const newScore = activePlayer.currentScore - totalScore
  const dartsActuallyThrown = dartDetails.filter((d) => d.state !== "empty").length

  const { isBust, isWin } = resolveBustAndWin(prev.finishMode, newScore, dartDetails)

  const turnHistory: TurnHistory = {
    darts,
    dartDetails,
    total: totalScore,
    scoreAfter: isBust ? activePlayer.currentScore : newScore,
    wasBust: isBust,
    isWinningRound: isWin,
    dartsActuallyThrown,
    legNumber: prev.currentLeg,
  }

  const updatedPlayers = prev.players.map((player, index) => {
    if (index === prev.activePlayerIndex) {
      return {
        ...player,
        currentScore: isBust ? player.currentScore : newScore,
        history: [...player.history, turnHistory],
      }
    }
    return player
  })

  if (isWin) {
    const updatedWithLeg = updatedPlayers.map((player, index) => {
      if (index === prev.activePlayerIndex) {
        return { ...player, legsWon: player.legsWon + 1 }
      }
      return player
    })

    const legsToWin = Math.ceil(prev.totalLegs / 2)
    const playerLegsAfterWin = updatedPlayers[prev.activePlayerIndex].legsWon + 1

    if (prev.totalLegs === 1 || playerLegsAfterWin >= legsToWin) {
      return {
        ...prev,
        phase: "finished",
        players: updatedWithLeg,
        winner: updatedWithLeg[prev.activePlayerIndex],
        legWinner: null,
      }
    }

    return {
      ...prev,
      phase: "legFinished",
      players: updatedWithLeg,
      legWinner: updatedWithLeg[prev.activePlayerIndex],
    }
  }

  const nextPlayerIndex = (prev.activePlayerIndex + 1) % prev.players.length
  return {
    ...prev,
    players: updatedPlayers,
    activePlayerIndex: nextPlayerIndex,
  }
}
