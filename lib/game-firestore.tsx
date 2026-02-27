import { collection, addDoc, query, where, getDocs, serverTimestamp, writeBatch, doc, Timestamp } from "firebase/firestore"
import { db } from "./firebase"
import type { Player, GameType, FinishMode, TotalLegs } from "./game-types"

export interface SavedPlayerStats {
  name: string
  legsWon: number
  average: number
  totalDarts: number
  remaining: number
  busts: number
  checkoutPct: number | null
}

export interface SavedGame {
  id: string
  userId: string
  timestamp: { seconds: number } | null
  gameMode: string
  finishMode: string
  legsPlayed: number
  winner: string
  players: SavedPlayerStats[]
}

const MAX_CHECKOUT = 170

export async function saveGameToFirestore(
  userId: string,
  players: Player[],
  gameType: GameType,
  finishMode: FinishMode,
  totalLegs: TotalLegs,
): Promise<string> {
  const winner = players.reduce((best, p) =>
    p.legsWon > best.legsWon ? p :
    p.legsWon === best.legsWon && p.currentScore < best.currentScore ? p : best
  , players[0])

  const startingScore = gameType === 301 ? 301 : 501

  const playerStats: SavedPlayerStats[] = players.map((p) => {
    const totalDarts = p.history.reduce((sum, h) => sum + (h.dartsActuallyThrown || 3), 0)
    const totalPoints = p.history.reduce((sum, h) => sum + (h.wasBust ? 0 : h.total), 0)
    const avg = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : 0
    const busts = p.history.filter((h) => h.wasBust).length

    // Compute checkout percentage
    let checkoutAttempts = 0
    let checkoutSuccesses = 0
    let runningScore = startingScore
    for (const h of p.history) {
      if (runningScore <= MAX_CHECKOUT && runningScore >= 2) {
        checkoutAttempts++
        if (!h.wasBust && h.scoreAfter === 0) {
          checkoutSuccesses++
        }
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
      checkoutPct: checkoutAttempts > 0
        ? Math.round((checkoutSuccesses / checkoutAttempts) * 1000) / 10
        : null,
    }
  })

  const payload = {
    userId,
    timestamp: serverTimestamp(),
    gameMode: String(gameType),
    finishMode,
    legsPlayed: totalLegs,
    winner: winner.name,
    players: playerStats,
  }

  const doc = await addDoc(collection(db, "games"), payload)
  return doc.id
}

/**
 * Fetch all unique player names from user's past games.
 * Results are cached in-memory to avoid repeated queries.
 */
let cachedPlayerNames: { userId: string; names: string[] } | null = null

export async function fetchPlayerNames(userId: string): Promise<string[]> {
  if (cachedPlayerNames && cachedPlayerNames.userId === userId) {
    return cachedPlayerNames.names
  }
  const games = await fetchUserGames(userId, 500)
  const nameSet = new Set<string>()
  for (const game of games) {
    for (const p of game.players) {
      if (p.name) nameSet.add(p.name)
    }
  }
  const names = Array.from(nameSet).sort((a, b) => a.localeCompare(b))
  cachedPlayerNames = { userId, names }
  return names
}

export function invalidatePlayerNamesCache() {
  cachedPlayerNames = null
}

export async function fetchUserGames(userId: string, count = 50): Promise<SavedGame[]> {
  // Simple query without orderBy -- avoids need for a composite index.
  // We sort client-side instead.
  const q = query(
    collection(db, "games"),
    where("userId", "==", userId),
  )
  const snapshot = await getDocs(q)
  const games = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SavedGame[]
  // Sort by timestamp descending client-side
  games.sort((a, b) => {
    const ta = a.timestamp?.seconds ?? 0
    const tb = b.timestamp?.seconds ?? 0
    return tb - ta
  })
  return games.slice(0, count)
}

/**
 * Compute Elo ratings for a set of saved games.
 * Returns a map from player name → rating (rounded to nearest integer).
 *
 * This mirrors the algorithm used in <StatsModal> and ensures that when new
 * games are started we can bootstrap players with their current rating. The
 * implementation sorts the games chronologically, initializes everyone at
 * 1500, and then applies pairwise K‑factor updates exactly as in the
 * modal logic.
 */
export function computeEloRatings(games: SavedGame[]): Record<string, number> {
  const initialRating = 1500
  const K = 32

  // sort oldest first
  const sorted = [...games].slice().sort((a, b) => {
    const ta = a.timestamp?.seconds ?? 0
    const tb = b.timestamp?.seconds ?? 0
    return ta - tb
  })

  const map = new Map<string, number>()

  for (const g of sorted) {
    // make sure every player has an entry
    for (const p of g.players) {
      if (!map.has(p.name)) {
        map.set(p.name, initialRating)
      }
    }

    if (!g.winner) continue

    const winnerName = g.winner
    const baseWinnerRating = map.get(winnerName)!
    let winnerDelta = 0

    for (const p of g.players) {
      if (p.name === winnerName) continue
      const oppRating = map.get(p.name)!
      // probability winner beats this opponent
      const expectedWin = 1 / (1 + Math.pow(10, (oppRating - baseWinnerRating) / 400))
      // opponent's expected score is the complement of expectedWin
      const expectedLose = 1 - expectedWin
      const delta = K * (1 - expectedWin)
      winnerDelta += delta
      // opponent should lose K * expectedLose (small if they were heavily
      // outrated, not large)
      map.set(p.name, oppRating - K * expectedLose)
    }

    // apply winner change after iterating opponents to avoid cascading effects
    map.set(winnerName, baseWinnerRating + winnerDelta)
  }

  const out: Record<string, number> = {}
  for (const [name, r] of map.entries()) {
    out[name] = Math.round(r)
  }
  return out
}

// ── Backup: export all user games to XML string ──────────────
export function gamesToXml(userId: string, games: SavedGame[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const now = new Date().toISOString()
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<dartsBackup userId="${esc(userId)}" timestamp="${now}">\n`
  xml += `  <games>\n`
  for (const g of games) {
    const ts = g.timestamp ? new Date(g.timestamp.seconds * 1000).toISOString() : ""
    xml += `    <game id="${esc(g.id)}">\n`
    xml += `      <timestamp>${ts}</timestamp>\n`
    xml += `      <gameMode>${esc(g.gameMode)}</gameMode>\n`
    xml += `      <finishMode>${esc(g.finishMode)}</finishMode>\n`
    xml += `      <legsPlayed>${g.legsPlayed}</legsPlayed>\n`
    xml += `      <winner>${esc(g.winner)}</winner>\n`
    xml += `      <players>\n`
    for (const p of g.players) {
      xml += `        <player name="${esc(p.name)}">\n`
      xml += `          <legsWon>${p.legsWon}</legsWon>\n`
      xml += `          <average>${p.average}</average>\n`
      xml += `          <totalDarts>${p.totalDarts}</totalDarts>\n`
      xml += `          <remaining>${p.remaining}</remaining>\n`
      xml += `          <busts>${p.busts}</busts>\n`
      xml += `          <checkoutPercentage>${p.checkoutPct ?? ""}</checkoutPercentage>\n`
      xml += `        </player>\n`
    }
    xml += `      </players>\n`
    xml += `    </game>\n`
  }
  xml += `  </games>\n`
  xml += `</dartsBackup>\n`
  return xml
}

// ── Restore: parse XML and write games to Firestore ──────────
export function parseBackupXml(xmlString: string): { userId: string; games: Omit<SavedGame, "id">[] } {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlString, "text/xml")

  const parseError = xmlDoc.querySelector("parsererror")
  if (parseError) throw new Error("Invalid XML format")

  const root = xmlDoc.documentElement
  if (root.tagName !== "dartsBackup") throw new Error("Not a darts backup file")

  const userId = root.getAttribute("userId") || ""
  const gameElements = xmlDoc.querySelectorAll("games > game")
  const games: Omit<SavedGame, "id">[] = []

  gameElements.forEach((gameEl) => {
    const tsText = gameEl.querySelector("timestamp")?.textContent || ""
    const tsDate = tsText ? new Date(tsText) : null

    const playerElements = gameEl.querySelectorAll("players > player")
    const players: SavedPlayerStats[] = []
    playerElements.forEach((pEl) => {
      const coPctText = pEl.querySelector("checkoutPercentage")?.textContent
      players.push({
        name: pEl.getAttribute("name") || "",
        legsWon: parseInt(pEl.querySelector("legsWon")?.textContent || "0", 10),
        average: parseFloat(pEl.querySelector("average")?.textContent || "0"),
        totalDarts: parseInt(pEl.querySelector("totalDarts")?.textContent || "0", 10),
        remaining: parseInt(pEl.querySelector("remaining")?.textContent || "0", 10),
        busts: parseInt(pEl.querySelector("busts")?.textContent || "0", 10),
        checkoutPct: coPctText ? parseFloat(coPctText) : null,
      })
    })

    games.push({
      userId,
      timestamp: tsDate ? { seconds: Math.floor(tsDate.getTime() / 1000) } : null,
      gameMode: gameEl.querySelector("gameMode")?.textContent || "",
      finishMode: gameEl.querySelector("finishMode")?.textContent || "",
      legsPlayed: parseInt(gameEl.querySelector("legsPlayed")?.textContent || "0", 10),
      winner: gameEl.querySelector("winner")?.textContent || "",
      players,
    })
  })

  return { userId, games }
}

export async function deleteAllUserGames(userId: string): Promise<void> {
  const q = query(collection(db, "games"), where("userId", "==", userId))
  const snapshot = await getDocs(q)
  // Delete in batches of 500
  const docs = snapshot.docs
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db)
    const chunk = docs.slice(i, i + 400)
    chunk.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}

export async function restoreGames(userId: string, games: Omit<SavedGame, "id">[]): Promise<number> {
  let written = 0
  for (let i = 0; i < games.length; i += 400) {
    const batch = writeBatch(db)
    const chunk = games.slice(i, i + 400)
    for (const game of chunk) {
      const ref = doc(collection(db, "games"))
      batch.set(ref, {
        userId,
        timestamp: game.timestamp
          ? Timestamp.fromMillis(game.timestamp.seconds * 1000)
          : serverTimestamp(),
        gameMode: game.gameMode,
        finishMode: game.finishMode,
        legsPlayed: game.legsPlayed,
        winner: game.winner,
        players: game.players,
      })
    }
    await batch.commit()
    written += chunk.length
  }
  invalidatePlayerNamesCache()
  return written
}
