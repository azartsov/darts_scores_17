"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { fetchPlayerNames } from "@/lib/game-firestore"
import { ChevronDown } from "lucide-react"

const MAX_NAME_LENGTH = 10

interface PlayerNameInputProps {
  value: string
  onChange: (name: string) => void
  placeholder: string
  maxLength?: number
  onEnter?: () => void
}

export function PlayerNameInput({ value, onChange, placeholder, maxLength = MAX_NAME_LENGTH, onEnter }: PlayerNameInputProps) {
  const { user } = useAuth()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [allNames, setAllNames] = useState<string[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load names once when user is available
  useEffect(() => {
    if (!user || loaded) return
    let cancelled = false
    fetchPlayerNames(user.uid).then((names) => {
      if (!cancelled) {
        setAllNames(names)
        setLoaded(true)
      }
    }).catch(() => {
      // Silently fail -- autocomplete just won't work
    })
    return () => { cancelled = true }
  }, [user, loaded])

  // Filter suggestions based on input
  const updateSuggestions = useCallback((text: string) => {
    if (!text.trim() || allNames.length === 0) {
      setSuggestions([])
      return
    }
    const lower = text.toLowerCase()
    const filtered = allNames
      .filter((n) => n.toLowerCase().includes(lower) && n.toLowerCase() !== lower)
      .slice(0, 5)
    setSuggestions(filtered)
  }, [allNames])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    if (val.length > maxLength) return
    onChange(val)
    updateSuggestions(val)
    setShowDropdown(true)
  }

  const handleFocus = () => {
    if (value.trim() && suggestions.length > 0) {
      setShowDropdown(true)
    } else if (!value.trim() && allNames.length > 0) {
      // Show all names when input is empty and focused
      setSuggestions(allNames.slice(0, 5))
      setShowDropdown(true)
    }
  }

  const handleDropdownClick = () => {
    // Show all available names when clicking dropdown button
    if (allNames.length > 0) {
      setSuggestions(allNames)
      setShowDropdown(true)
      inputRef.current?.focus()
    }
  }

  const selectName = (name: string) => {
    onChange(name)
    setShowDropdown(false)
    setSuggestions([])
  }

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // No autocomplete for guests
  if (!user) {
    return (
      <div className="flex-1 relative">
        <Input
          value={value}
          onChange={(e) => { if (e.target.value.length <= maxLength) onChange(e.target.value) }}
          maxLength={maxLength}
          className="bg-input border-border text-foreground pr-9"
          placeholder={placeholder}
        />
        <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tabular-nums pointer-events-none ${
          value.length >= maxLength ? "text-destructive" : "text-muted-foreground/50"
        }`}>
          {value.length}/{maxLength}
        </span>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="flex-1 relative">
      <div className="flex items-center">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          maxLength={maxLength}
          className="bg-input border-border text-foreground pr-9"
          placeholder={placeholder}
          autoComplete="off"
        />
        {allNames.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDropdownClick}
            className="absolute right-0 h-full w-9 text-muted-foreground hover:text-foreground shrink-0"
            title="Show all players"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        )}
      </div>
      <span className={`absolute right-8 top-1/2 -translate-y-1/2 text-[10px] tabular-nums pointer-events-none ${
        value.length >= maxLength ? "text-destructive" : "text-muted-foreground/50"
      }`}>
        {value.length}/{maxLength}
      </span>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectName(name)}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent/50 transition-colors border-b border-border/30 last:border-b-0"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
