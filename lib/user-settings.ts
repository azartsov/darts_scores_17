import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "./firebase"

export const TOUCH_HOLD_DELAY_STORAGE_KEY = "dartsTouchHoldDelayMs"
export const TOUCH_HOLD_DELAY_EVENT = "darts-touch-hold-delay-changed"
export const DEFAULT_TOUCH_HOLD_DELAY_MS = 700
export const MIN_TOUCH_HOLD_DELAY_MS = 0
export const MAX_TOUCH_HOLD_DELAY_MS = 1500

export function clampTouchHoldDelayMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TOUCH_HOLD_DELAY_MS
  return Math.min(MAX_TOUCH_HOLD_DELAY_MS, Math.max(MIN_TOUCH_HOLD_DELAY_MS, Math.round(value)))
}

export async function loadUserTouchHoldDelayMs(userId: string): Promise<number | null> {
  const ref = doc(db, "user_settings", userId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const raw = snap.data()?.touchHoldDelayMs
  if (typeof raw !== "number") return null
  return clampTouchHoldDelayMs(raw)
}

export async function saveUserTouchHoldDelayMs(userId: string, value: number): Promise<void> {
  const ref = doc(db, "user_settings", userId)
  await setDoc(ref, { touchHoldDelayMs: clampTouchHoldDelayMs(value) }, { merge: true })
}
