"use strict";
/**
 * Canonical Shop Status & Operational Schedule Engine for PrintBK
 *
 * Precedence Rule:
 * 1. Manual switch: If manually set to CLOSED, the shop is always CLOSED.
 * 2. Pause toggle: If paused, the shop is CLOSED.
 * 3. Schedule / Hours: If "open by hours" is enabled, the shop is OPEN only
 *    during configured hours; otherwise CLOSED.
 * 4. Default: If manual switch is OPEN and no pause/hour restriction, shop is OPEN.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTimeToMinutes = parseTimeToMinutes;
exports.isWithinOperationalHours = isWithinOperationalHours;
exports.computeEffectiveShopStatus = computeEffectiveShopStatus;
/**
 * Parses time string like "8:30 AM" or "18:00" into minutes from midnight (0-1439).
 */
function parseTimeToMinutes(timeStr) {
    if (!timeStr)
        return null;
    const cleaned = timeStr.trim().toUpperCase();
    const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!match)
        return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3];
    if (ampm === 'PM' && hours < 12)
        hours += 12;
    if (ampm === 'AM' && hours === 12)
        hours = 0;
    return hours * 60 + minutes;
}
/**
 * Checks if current time is within operational hours.
 * Default hours format: "8:30 AM – 6:00 PM (Mon–Sat)"
 */
function isWithinOperationalHours(hoursStr, date = new Date()) {
    if (!hoursStr)
        return { within: true, reopenAt: null };
    // Convert to Indian Standard Time (UTC+5:30)
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    const istDate = new Date(utc + 5.5 * 3600000);
    const day = istDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const currentMinutes = istDate.getHours() * 60 + istDate.getMinutes();
    // Parse days: e.g., "(Mon–Sat)" or "(Mon-Fri)"
    const isSunday = day === 0;
    if (hoursStr.includes('Mon–Sat') || hoursStr.includes('Mon-Sat')) {
        if (isSunday) {
            return { within: false, reopenAt: 'Monday at 8:30 AM' };
        }
    }
    else if (hoursStr.includes('Mon–Fri') || hoursStr.includes('Mon-Fri')) {
        if (day === 0 || day === 6) {
            return { within: false, reopenAt: 'Monday at 8:30 AM' };
        }
    }
    // Parse time window: "8:30 AM – 6:00 PM"
    const rangeMatch = hoursStr.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[–\-—]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
    if (rangeMatch) {
        const startMin = parseTimeToMinutes(rangeMatch[1]);
        const endMin = parseTimeToMinutes(rangeMatch[2]);
        if (startMin !== null && endMin !== null) {
            if (currentMinutes < startMin) {
                return { within: false, reopenAt: `Today at ${rangeMatch[1].trim()}` };
            }
            if (currentMinutes >= endMin) {
                return { within: false, reopenAt: `Tomorrow at ${rangeMatch[1].trim()}` };
            }
            return { within: true, reopenAt: null };
        }
    }
    return { within: true, reopenAt: null };
}
/**
 * Computes single authoritative server-calculated effective shop status.
 */
function computeEffectiveShopStatus(settings, nowSec = Math.floor(Date.now() / 1000)) {
    const precedenceDesc = 'Precedence: Manual switch (CLOSED) > Temporary Pause > Scheduled Hours > Open';
    // 1. Manual override takes highest precedence
    const manualOpen = settings.open !== false && String(settings.open) !== 'false';
    if (!manualOpen) {
        return {
            open: false,
            reason: 'manual',
            closedSince: settings.closed_since || nowSec,
            reopenAt: null,
            announcement: settings.announcement || 'Shop is currently closed.',
            precedenceDescription: precedenceDesc
        };
    }
    // 2. Pause toggle
    const isPaused = settings.paused === true || String(settings.paused) === 'true';
    if (isPaused) {
        return {
            open: false,
            reason: 'paused',
            closedSince: settings.closed_since || nowSec,
            reopenAt: null,
            announcement: settings.announcement || 'Ordering is temporarily paused by counter staff.',
            precedenceDescription: precedenceDesc
        };
    }
    // 3. Operational Hours check (if enabled)
    const hoursEnabled = settings.hours_enabled === true || String(settings.hours_enabled) === 'true' ||
        settings.open_by_hours === true || String(settings.open_by_hours) === 'true';
    const hoursConfig = settings.hours || settings.shop_info?.hours || '8:30 AM – 6:00 PM (Mon–Sat)';
    if (hoursEnabled) {
        const { within, reopenAt } = isWithinOperationalHours(hoursConfig, new Date(nowSec * 1000));
        if (!within) {
            return {
                open: false,
                reason: 'hours',
                closedSince: settings.closed_since || nowSec,
                reopenAt,
                announcement: settings.announcement || `Shop is outside working hours (${hoursConfig}). Reopens ${reopenAt || 'soon'}.`,
                precedenceDescription: precedenceDesc
            };
        }
    }
    // 4. Default: Open
    return {
        open: true,
        reason: 'open',
        closedSince: null,
        reopenAt: null,
        announcement: settings.announcement || '',
        precedenceDescription: precedenceDesc
    };
}
