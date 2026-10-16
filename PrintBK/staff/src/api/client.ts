// Real API client for PrintBK Staff Counter App
// Zero mock data. Strictly connects to Zoho Catalyst backend at /server/api/staff/*

const TOKEN_KEY = "printbk_staff_token"
const DEVICE_ID_KEY = "printbk_staff_device_id"

export function getStaffToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStaffCredentials(deviceId: string, token: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem("printbk-paired", "true")
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function clearStaffCredentials(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(DEVICE_ID_KEY)
    localStorage.removeItem("printbk-paired")
  } catch {
    // Ignore
  }
}

export function isStaffPaired(): boolean {
  try {
    return !!getStaffToken() || localStorage.getItem("printbk-paired") === "true"
  } catch {
    return false
  }
}

export class StaffApiError extends Error {
  status: number
  data?: any
  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = "StaffApiError"
    this.status = status
    this.data = data
  }
}

async function staffFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = getStaffToken()
  const headers = new Headers(options.headers || {})
  
  if (token && !headers.has("X-Staff-Device-Token")) {
    headers.set("X-Staff-Device-Token", token)
  }
  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  // Prepend /server/api if not present
  const url = endpoint.startsWith("/server/api") ? endpoint : `/server/api${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    // Token is invalid or revoked
    clearStaffCredentials()
    window.dispatchEvent(new CustomEvent("printbk-unauthorized"))
    throw new StaffApiError("Unauthorized: Staff device credentials invalid or revoked.", 401)
  }

  return response
}

export async function pairStaffDevice(setupCode: string, label = "Counter PC") {
  const res = await fetch("/server/api/staff/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupCode: setupCode.trim(), label }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to pair device", res.status, data)
  }
  if (data.deviceToken && data.deviceId) {
    setStaffCredentials(data.deviceId, data.deviceToken)
  }
  return data
}

export async function fetchLiveFeed(cursor?: string, lastEtag?: string) {
  const headers: Record<string, string> = {}
  if (lastEtag) {
    headers["If-None-Match"] = lastEtag
  }
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""
  const res = await staffFetch(`/staff/live${query}`, {
    method: "GET",
    headers,
  })

  if (res.status === 304) {
    return { notModified: true as const, etag: lastEtag }
  }

  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to fetch live feed", res.status, data)
  }
  const etag = res.headers.get("ETag") || undefined
  return { notModified: false as const, data, etag }
}

export async function collectCash(orderId: number) {
  const res = await staffFetch(`/staff/orders/${orderId}/collect-cash`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to collect cash", res.status, data)
  }
  return data
}

export async function approvePrintItem(itemId: string) {
  const res = await staffFetch(`/staff/items/${itemId}/approve-print`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to approve print", res.status, data)
  }
  return data
}

export async function retryPrintItem(itemId: string) {
  const res = await staffFetch(`/staff/items/${itemId}/retry`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to retry print", res.status, data)
  }
  return data
}

export async function markItemDone(itemId: string) {
  const res = await staffFetch(`/staff/items/${itemId}/done`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to mark item done", res.status, data)
  }
  return data
}

export async function quoteItem(itemId: string, price: number) {
  const res = await staffFetch(`/staff/items/${itemId}/quote`, {
    method: "POST",
    body: JSON.stringify({ price }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to send quote", res.status, data)
  }
  return data
}

export async function rejectOrder(orderId: number, reason: string) {
  const res = await staffFetch(`/staff/orders/${orderId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to reject order", res.status, data)
  }
  return data
}

export async function undoAction(actionId: string) {
  const res = await staffFetch("/staff/undo", {
    method: "POST",
    body: JSON.stringify({ actionId }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to undo action", res.status, data)
  }
  return data
}

export async function fetchTodayAnalytics() {
  const res = await staffFetch("/staff/today", { method: "GET" })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to fetch today analytics", res.status, data)
  }
  return data
}

export async function fetchHistoryOrders(params?: {
  search?: string
  limit?: number
  offset?: number
  date?: string
  payment?: string
}) {
  const query = new URLSearchParams()
  if (params?.search) query.set("search", params.search)
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.offset) query.set("offset", String(params.offset))
  if (params?.date) query.set("date", params.date)
  if (params?.payment && params.payment !== "All payments") query.set("payment", params.payment)

  const res = await staffFetch(`/staff/history?${query.toString()}`, { method: "GET" })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to fetch order history", res.status, data)
  }
  return data
}

export async function fetchShopSettings() {
  const res = await staffFetch("/staff/settings", { method: "GET" })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to fetch shop settings", res.status, data)
  }
  return data.settings
}

export async function updateShopSettings(settings: Record<string, any>) {
  const res = await staffFetch("/staff/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to update shop settings", res.status, data)
  }
  return data
}

export async function fetchPairedDevices() {
  const res = await staffFetch("/staff/devices", { method: "GET" })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to fetch paired devices", res.status, data)
  }
  return data
}

export async function revokeDevice(deviceId: string) {
  const res = await staffFetch(`/staff/devices/${deviceId}/revoke`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to revoke device", res.status, data)
  }
  return data
}

export async function testPrintPrinter(printerId: string) {
  const res = await staffFetch(`/staff/printers/${printerId}/test-print`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to trigger test print", res.status, data)
  }
  return data
}

export async function printQrPrinter(printerId: string) {
  const res = await staffFetch(`/staff/printers/${printerId}/print-qr`, {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to trigger QR print", res.status, data)
  }
  return data
}

export async function addStaffPrinter(name: string, role: string = "both") {
  const res = await staffFetch("/staff/printers/add", {
    method: "POST",
    body: JSON.stringify({ name, role }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to add printer", res.status, data)
  }
  return data
}

export async function purgeStaleOrders() {
  const res = await staffFetch("/staff/orders/purge-stale", {
    method: "POST",
  })
  const data = await res.json()
  if (!res.ok) {
    throw new StaffApiError(data.error || "Failed to purge stale orders", res.status, data)
  }
  return data
}

