import { describe, expect, it } from "vitest"
import type { DartInput, GameState, Player } from "./game-types"
import { applyTurn } from "./game-engine"

function makePlayer(name: string, startingScore = 501): Player {
  return {
    id: name,
    name,
    startingScore,
    currentScore: startingScore,
    history: [],
    legsWon: 0,
    rating: 1500,
  }
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    phase: "playing",
    gameType: 501,
    finishMode: "double",
    totalLegs: 3,
    currentLeg: 1,
    players: [makePlayer("A"), makePlayer("B")],
    activePlayerIndex: 0,
    winner: null,
    legWinner: null,
    startTime: Date.now(),
    ...overrides,
  }
}

function scored(value: number, multiplier: 1 | 2 | 3 = 1): DartInput {
  return { value, multiplier, state: "scored" }
}

function miss(): DartInput {
  return { value: 0, multiplier: 1, state: "miss" }
}

describe("applyTurn", () => {
  describe("game completion matrix", () => {
    it.each([
      { gameType: 301 as const, finishMode: "simple" as const, currentScore: 32, darts: [32, 0, 0] as [number, number, number], details: [scored(16, 2), miss(), miss()] as [DartInput, DartInput, DartInput] },
      { gameType: 301 as const, finishMode: "double" as const, currentScore: 40, darts: [40, 0, 0] as [number, number, number], details: [scored(20, 2), miss(), miss()] as [DartInput, DartInput, DartInput] },
      { gameType: 501 as const, finishMode: "simple" as const, currentScore: 45, darts: [45, 0, 0] as [number, number, number], details: [scored(15, 3), miss(), miss()] as [DartInput, DartInput, DartInput] },
      { gameType: 501 as const, finishMode: "double" as const, currentScore: 50, darts: [50, 0, 0] as [number, number, number], details: [scored(25, 2), miss(), miss()] as [DartInput, DartInput, DartInput] },
    ])(
      "finishes single-leg game for $gameType in $finishMode mode",
      ({ gameType, finishMode, currentScore, darts, details }) => {
        const state = makeState({
          gameType,
          finishMode,
          totalLegs: 1,
          players: [
            { ...makePlayer("A", gameType), currentScore },
            { ...makePlayer("B", gameType), currentScore: gameType },
          ],
        })

        const next = applyTurn(state, darts, details)
        expect(next.phase).toBe("finished")
        expect(next.winner?.name).toBe("A")
        expect(next.players[0].currentScore).toBe(0)
      },
    )

    it.each([
      { gameType: 301 as const, totalLegs: 3 as const },
      { gameType: 501 as const, totalLegs: 5 as const },
      { gameType: 501 as const, totalLegs: 7 as const },
    ])(
      "finishes match when player reaches required legs ($gameType, best of $totalLegs)",
      ({ gameType, totalLegs }) => {
        const legsToWin = Math.ceil(totalLegs / 2)
        const state = makeState({
          gameType,
          finishMode: "double",
          totalLegs,
          currentLeg: legsToWin,
          players: [
            { ...makePlayer("A", gameType), currentScore: 40, legsWon: legsToWin - 1 },
            { ...makePlayer("B", gameType), currentScore: gameType, legsWon: 0 },
          ],
        })

        const next = applyTurn(state, [40, 0, 0], [scored(20, 2), miss(), miss()])
        expect(next.phase).toBe("finished")
        expect(next.winner?.name).toBe("A")
        expect(next.players[0].legsWon).toBe(legsToWin)
      },
    )

    it.each([
      { totalLegs: 1 as const, expectedPhase: "finished" as const },
      { totalLegs: 3 as const, expectedPhase: "legFinished" as const },
      { totalLegs: 5 as const, expectedPhase: "legFinished" as const },
      { totalLegs: 7 as const, expectedPhase: "legFinished" as const },
      { totalLegs: 9 as const, expectedPhase: "legFinished" as const },
    ])(
      "smoke: after winning a leg in best of $totalLegs, phase is $expectedPhase",
      ({ totalLegs, expectedPhase }) => {
        const state = makeState({
          gameType: 501,
          finishMode: "double",
          totalLegs,
          players: [
            { ...makePlayer("A", 501), currentScore: 40, legsWon: 0 },
            { ...makePlayer("B", 501), currentScore: 501, legsWon: 0 },
          ],
        })

        const next = applyTurn(state, [40, 0, 0], [scored(20, 2), miss(), miss()])
        expect(next.phase).toBe(expectedPhase)
        expect(next.players[0].legsWon).toBe(1)

        if (expectedPhase === "legFinished") {
          expect(next.winner).toBeNull()
          expect(next.legWinner?.name).toBe("A")
        } else {
          expect(next.winner?.name).toBe("A")
          expect(next.legWinner).toBeNull()
        }
      },
    )
  })

  it("finishes in simple mode on exact zero", () => {
    const state = makeState({
      finishMode: "simple",
      totalLegs: 1,
      players: [
        { ...makePlayer("A", 40), currentScore: 40 },
        { ...makePlayer("B", 40), currentScore: 40 },
      ],
    })

    const next = applyTurn(state, [40, 0, 0], [scored(20, 2), miss(), miss()])
    expect(next.phase).toBe("finished")
    expect(next.winner?.name).toBe("A")
    expect(next.players[0].currentScore).toBe(0)
  })

  it("treats reaching 1 in double mode as bust", () => {
    const state = makeState({
      players: [
        { ...makePlayer("A", 40), currentScore: 40 },
        { ...makePlayer("B", 40), currentScore: 40 },
      ],
    })

    const next = applyTurn(state, [39, 0, 0], [scored(13, 3), miss(), miss()])
    expect(next.phase).toBe("playing")
    expect(next.players[0].currentScore).toBe(40)
    expect(next.players[0].history.at(-1)?.wasBust).toBe(true)
  })

  it("wins in double mode only if last scoring dart is double/bullseye", () => {
    const state = makeState({
      totalLegs: 1,
      players: [
        { ...makePlayer("A", 40), currentScore: 40 },
        { ...makePlayer("B", 40), currentScore: 40 },
      ],
    })

    const win = applyTurn(state, [40, 0, 0], [scored(20, 2), miss(), miss()])
    expect(win.phase).toBe("finished")
    expect(win.winner?.name).toBe("A")

    const bust = applyTurn(state, [40, 0, 0], [scored(20, 1), scored(20, 1), miss()])
    expect(bust.phase).toBe("playing")
    expect(bust.players[0].currentScore).toBe(40)
    expect(bust.players[0].history.at(-1)?.wasBust).toBe(true)
  })

  it("goes to legFinished when leg won but match continues", () => {
    const state = makeState({
      totalLegs: 3,
      players: [
        { ...makePlayer("A", 40), currentScore: 40, legsWon: 0 },
        { ...makePlayer("B", 40), currentScore: 40, legsWon: 0 },
      ],
    })

    const next = applyTurn(state, [40, 0, 0], [scored(20, 2), miss(), miss()])
    expect(next.phase).toBe("legFinished")
    expect(next.legWinner?.name).toBe("A")
    expect(next.players[0].legsWon).toBe(1)
  })

  it("switches active player on normal non-winning turn", () => {
    const state = makeState({
      players: [
        { ...makePlayer("A", 101), currentScore: 101 },
        { ...makePlayer("B", 101), currentScore: 101 },
      ],
    })

    const next = applyTurn(state, [60, 0, 0], [scored(20, 3), miss(), miss()])
    expect(next.players[0].currentScore).toBe(41)
    expect(next.activePlayerIndex).toBe(1)
    expect(next.phase).toBe("playing")
  })
})
