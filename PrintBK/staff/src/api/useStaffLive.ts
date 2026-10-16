import { useEffect, useRef, useState, useCallback } from "react"
import { fetchLiveFeed, isStaffPaired, getStaffToken } from "./client"

export interface LiveShop {
  open: boolean
  version?: number
  announcement?: string
  rates?: Record<string, number>
  mixed_colour_mode?: string
  delete_delay_minutes?: number
  name?: string
  phone?: string
  address?: string
}

export interface LivePrinter {
  id: string
  name: string
  role?: string
  online: boolean
  status?: string
  paper_level?: string
  last_seen?: string
}

export interface LiveCounters {
  waiting: number
  cashToCollect: number
  upiToVerify: number
  printedToday: number
  collectedToday: number
}

export interface LiveItem {
  id: string
  order_id: number
  order_number: number
  pickup_code: string
  kind: string
  status: string
  payment_status: "paid_online" | "upi_claimed" | "pending_cash" | "cash_collected"
  price: number
  pages_done: number
  pages_total: number
  created_at: string
  printed_at?: string
  delete_after?: string
  files_deleted_at?: string
  payload?: any
  linked_print_item_id?: string
  printer_role?: string
}

export interface LiveRecentlyPrinted {
  item_id: string
  order_number: number
  pickup_code: string
  kind: string
  printed_at: string
  delete_after?: string
  files_deleted_at?: string
}

export interface UseStaffLiveReturn {
  items: LiveItem[]
  printers: LivePrinter[]
  shop: LiveShop
  counters: LiveCounters
  recentlyPrinted: LiveRecentlyPrinted[]
  online: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function useStaffLive(): UseStaffLiveReturn {
  const [items, setItems] = useState<LiveItem[]>([])
  const [printers, setPrinters] = useState<LivePrinter[]>([])
  const [shop, setShop] = useState<LiveShop>({ open: true })
  const [counters, setCounters] = useState<LiveCounters>({
    waiting: 0,
    cashToCollect: 0,
    upiToVerify: 0,
    printedToday: 0,
    collectedToday: 0,
  })
  const [recentlyPrinted, setRecentlyPrinted] = useState<LiveRecentlyPrinted[]>([])
  const [online, setOnline] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const cursorRef = useRef<string | undefined>(undefined)
  const lastEtagRef = useRef<string | undefined>(undefined)
  const isPollingRef = useRef<boolean>(false)
  const timeoutIdRef = useRef<number | null>(null)

  const poll = useCallback(async () => {
    if (!isStaffPaired() || isPollingRef.current) return
    isPollingRef.current = true

    try {
      const res = await fetchLiveFeed(cursorRef.current, lastEtagRef.current)
      setOnline(true)
      setError(null)

      if (res.notModified) {
        // Nothing changed on the server
      } else {
        lastEtagRef.current = res.etag
        const data = res.data

        if (data.cursor) {
          cursorRef.current = data.cursor
        }
        if (data.shop) {
          setShop(data.shop)
        }
        if (Array.isArray(data.printers)) {
          setPrinters(data.printers)
        }
        if (data.counters) {
          setCounters(data.counters)
        }
        if (Array.isArray(data.recentlyPrinted)) {
          setRecentlyPrinted(data.recentlyPrinted)
        }

        // Apply delta items
        setItems((currentItems) => {
          let updated = [...currentItems]

          // 1. Remove items indicated by removedItemIds
          if (Array.isArray(data.removedItemIds) && data.removedItemIds.length > 0) {
            const removedSet = new Set(data.removedItemIds)
            updated = updated.filter((item) => !removedSet.has(item.id))
          }

          // 2. Add or update changed items
          if (Array.isArray(data.items) && data.items.length > 0) {
            for (const newItem of data.items) {
              const idx = updated.findIndex((item) => item.id === newItem.id)
              if (idx >= 0) {
                updated[idx] = newItem
              } else {
                updated.push(newItem)
              }
            }
          }

          // Sort by creation time (first uploaded first)
          updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          return updated
        })
      }
    } catch (err: any) {
      if (err.name === "StaffApiError" && err.status === 401) {
        // Handled by client, will trigger printbk-unauthorized
      } else {
        setOnline(false)
        setError(err)
      }
    } finally {
      isPollingRef.current = false

      // Adaptive polling: 1s when active orders exist, backed off to 3s when empty
      const hasActiveOrders = items.length > 0
      const delay = hasActiveOrders ? 1000 : 3000

      if (timeoutIdRef.current) {
        window.clearTimeout(timeoutIdRef.current)
      }
      timeoutIdRef.current = window.setTimeout(poll, delay)
    }
  }, [items.length])

  // Instant refresh callback
  const refresh = useCallback(async () => {
    if (timeoutIdRef.current) {
      window.clearTimeout(timeoutIdRef.current)
    }
    await poll()
  }, [poll])

  useEffect(() => {
    // Initial fetch
    poll()

    // Instant refresh on window focus and online events
    const handleFocus = () => refresh()
    const handleOnline = () => {
      setOnline(true)
      refresh()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener("focus", handleFocus)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      if (timeoutIdRef.current) {
        window.clearTimeout(timeoutIdRef.current)
      }
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [poll, refresh])

  return {
    items,
    printers,
    shop,
    counters,
    recentlyPrinted,
    online,
    error,
    refresh,
  }
}
