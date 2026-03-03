import { describe, expect, it } from "vitest"
import { computeEloRatings, gamesToXml, parseBackupXml, type SavedGame } from "./game-firestore"

function makeGame(params: {
  id: string
  ts: number
  winner: string
  players: string[]
}): SavedGame {
  return {
    id: params.id,
    userId: "u1",
    timestamp: { seconds: params.ts },
    gameMode: "501",
    finishMode: "double",
    legsPlayed: 1,
    winner: params.winner,
    players: params.players.map((name) => ({
      name,
      legsWon: name === params.winner ? 1 : 0,
      average: 60,
      totalDarts: 18,
      remaining: name === params.winner ? 0 : 40,
      busts: 0,
      checkoutPct: 50,
    })),
  }
}

describe("computeEloRatings", () => {
  it("keeps winner above loser after head-to-head game", () => {
    const games: SavedGame[] = [
      makeGame({ id: "g1", ts: 1000, winner: "Alice", players: ["Alice", "Bob"] }),
    ]
    const ratings = computeEloRatings(games)
    expect(ratings.Alice).toBeGreaterThan(1500)
    expect(ratings.Bob).toBeLessThan(1500)
  })

  it("is deterministic for chronological processing", () => {
    const games: SavedGame[] = [
      makeGame({ id: "g2", ts: 2000, winner: "Bob", players: ["Alice", "Bob"] }),
      makeGame({ id: "g1", ts: 1000, winner: "Alice", players: ["Alice", "Bob"] }),
      makeGame({ id: "g3", ts: 3000, winner: "Alice", players: ["Alice", "Bob"] }),
    ]
    const ratings1 = computeEloRatings(games)
    const ratings2 = computeEloRatings([...games].reverse())
    expect(ratings1).toEqual(ratings2)
  })
})

describe("backup XML helpers", () => {
  it("serializes games to XML and parses them back", () => {
    const sourceGames: SavedGame[] = [
      makeGame({ id: "g10", ts: 12345, winner: "Alice", players: ["Alice", "Bob"] }),
      makeGame({ id: "g11", ts: 12399, winner: "Bob", players: ["Alice", "Bob", "Eve"] }),
    ]

    const xml = gamesToXml("u1", sourceGames)
    const parsed = parseBackupXml(xml)

    expect(parsed.userId).toBe("u1")
    expect(parsed.games).toHaveLength(2)
    expect(parsed.games[0].winner).toBe("Alice")
    expect(parsed.games[1].players).toHaveLength(3)
  })
})
