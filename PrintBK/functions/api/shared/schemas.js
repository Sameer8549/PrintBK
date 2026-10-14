"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffActionRecordSchema = exports.OrderEventRecordSchema = exports.ShopSettingsRecordSchema = exports.PrinterRecordSchema = exports.AgentDeviceRecordSchema = exports.StaffDeviceRecordSchema = exports.PrintJobRecordSchema = exports.OrderItemRecordSchema = exports.OrderItemSchema = exports.OrderItemPricingSchema = exports.TypingCustomSpecsSchema = exports.PhotocopySpecsSchema = exports.ScanningSpecsSchema = exports.LaminationSpecsSchema = exports.BindingSpecsSchema = exports.PhotoSpecsSchema = exports.DocumentColourSpecsSchema = exports.DocumentBwSpecsSchema = exports.ItemStatusSchema = exports.OrderItemTypeSchema = exports.OrderStatusSchema = exports.BasketSchema = exports.ServiceLineSchema = exports.PrintFileSchema = exports.ColorPlanSchema = exports.ShopConfigSchema = void 0;
exports.isStaffVisibleOrder = isStaffVisibleOrder;
exports.canApprovePrint = canApprovePrint;
exports.canCollectCash = canCollectCash;
exports.canMarkServiceDone = canMarkServiceDone;
const zod_1 = require("zod");
exports.ShopConfigSchema = zod_1.z.object({
    rates: zod_1.z.object({
        bw: zod_1.z.number(),
        color: zod_1.z.number(),
        scan: zod_1.z.number(),
        photocopy: zod_1.z.number(),
        doubleSideDiscount: zod_1.z.number(),
        bulkTierThreshold: zod_1.z.number(),
        bulkTierRate: zod_1.z.number(),
        paperMultipliers: zod_1.z.object({
            A4: zod_1.z.number(),
            A3: zod_1.z.number(),
            Legal: zod_1.z.number(),
        }),
        staple: zod_1.z.number(),
        spiral: zod_1.z.number(),
        comb: zod_1.z.number(),
        hardCover: zod_1.z.number(),
        laminationID: zod_1.z.number(),
        laminationA4: zod_1.z.number(),
        laminationA3: zod_1.z.number(),
        laminationThickExtra: zod_1.z.number(),
        rushSurcharge: zod_1.z.number(),
        gatewayFee: zod_1.z.number().default(0)
    }),
    rushEnabled: zod_1.z.boolean().default(false),
    maxFileMB: zod_1.z.number().default(25),
    autoDeleteDelay: zod_1.z.number().default(5)
});
exports.ColorPlanSchema = zod_1.z.object({
    mode: zod_1.z.enum(['bw', 'colour', 'color', 'auto', 'custom']).default('bw'),
    colorPages: zod_1.z.array(zod_1.z.number()).default([])
});
exports.PrintFileSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    size: zod_1.z.number(),
    type: zod_1.z.string(),
    pages: zod_1.z.number(),
    colorPages: zod_1.z.number().default(0),
    colorDetection: zod_1.z.enum(['pending', 'done', 'failed', 'na']).default('na'),
    pageMetrics: zod_1.z.array(zod_1.z.object({
        pageNumber: zod_1.z.number(),
        width: zod_1.z.number(),
        height: zod_1.z.number(),
        rotation: zod_1.z.number().optional()
    })).optional(),
    settings: zod_1.z.object({
        copies: zod_1.z.number().default(1),
        colorMode: zod_1.z.enum(['bw', 'color', 'colour', 'auto', 'custom']).default('bw'),
        colorPlan: exports.ColorPlanSchema.optional(),
        sided: zod_1.z.enum(['single', 'double']).default('single'),
        paper: zod_1.z.enum(['A4', 'A3', 'Legal']).default('A4'),
        orientation: zod_1.z.enum(['portrait', 'landscape', 'auto']).default('auto'),
        nUp: zod_1.z.number().default(1),
        layout: zod_1.z.enum(['standard', 'handout', 'booklet']).default('standard'),
        booklet: zod_1.z.boolean().default(false),
        range: zod_1.z.string().default('all'),
        pageRotations: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional().default({}),
        duplexEdge: zod_1.z.enum(['long', 'short']).optional()
    })
});
exports.ServiceLineSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: zod_1.z.enum(['addon', 'walkin', 'request']),
    name: zod_1.z.string(),
    price: zod_1.z.number().optional(),
    qty: zod_1.z.number().default(1),
    attachTo: zod_1.z.string().optional(),
    detail: zod_1.z.string().optional(),
    counterNote: zod_1.z.string().optional()
});
exports.BasketSchema = zod_1.z.object({
    files: zod_1.z.array(exports.PrintFileSchema),
    services: zod_1.z.array(exports.ServiceLineSchema),
    rush: zod_1.z.boolean().default(false)
});
exports.OrderStatusSchema = zod_1.z.enum([
    'pending_payment', 'pending_cash', 'upi_started', 'upi_claimed', 'cash_collected', 'waiting_quote', 'quote_sent', 'accepted', 'declined',
    'paid', 'processing', 'printing', 'ready', 'completed', 'cancelled', 'rejected', 'failed', 'refunded', 'expired'
]);
/* ─── Typed Order Items for Staff App Tables ──────────────────────── */
exports.OrderItemTypeSchema = zod_1.z.enum([
    'document_bw',
    'document_colour',
    'photo',
    'binding',
    'lamination',
    'scanning',
    'photocopy',
    'typing_request',
    'typing_custom'
]);
exports.ItemStatusSchema = zod_1.z.enum([
    'waiting_payment',
    'preparing',
    'ready_to_print',
    'sending',
    'printing',
    'printed',
    'failed',
    'waiting_for_print',
    'ready_to_bind',
    'done',
    'quote_waiting',
    'quote_sent',
    'quote_accepted',
    'expired',
    'cancelled',
    'rejected'
]);
exports.DocumentBwSpecsSchema = zod_1.z.object({
    pages: zod_1.z.number(),
    copies: zod_1.z.number().default(1),
    sides: zod_1.z.enum(['single', 'double']).default('single'),
    paper: zod_1.z.enum(['A4', 'A3', 'Legal']).default('A4'),
    orientation: zod_1.z.enum(['portrait', 'landscape', 'auto']).default('auto'),
    nUp: zod_1.z.number().default(1),
    duplexEdge: zod_1.z.enum(['long', 'short']).optional(),
    fileId: zod_1.z.string(),
    originalFilename: zod_1.z.string(),
    layout: zod_1.z.enum(['standard', 'handout', 'booklet']).default('standard')
});
exports.DocumentColourSpecsSchema = exports.DocumentBwSpecsSchema.extend({
    colorPlan: exports.ColorPlanSchema,
    bwPagesCount: zod_1.z.number(),
    colourPagesCount: zod_1.z.number()
});
exports.PhotoSpecsSchema = zod_1.z.object({
    size: zod_1.z.enum(['passport', 'stamp', '4x6', '5x7', 'A4']),
    paperType: zod_1.z.enum(['glossy', 'matte']).default('glossy'),
    copies: zod_1.z.number().default(1),
    fileId: zod_1.z.string().optional()
});
exports.BindingSpecsSchema = zod_1.z.object({
    kind: zod_1.z.enum(['soft', 'spiral', 'hard']),
    pageCount: zod_1.z.number(),
    colorCover: zod_1.z.boolean().default(false),
    attachedToFileId: zod_1.z.string().optional()
});
exports.LaminationSpecsSchema = zod_1.z.object({
    size: zod_1.z.enum(['ID', 'A4', 'A3']),
    thickness: zod_1.z.enum(['standard', 'thick']).default('standard'),
    quantity: zod_1.z.number().default(1),
    attachedToFileId: zod_1.z.string().optional()
});
exports.ScanningSpecsSchema = zod_1.z.object({
    pages: zod_1.z.number(),
    dpi: zod_1.z.number().default(300),
    colour: zod_1.z.enum(['bw', 'colour']).default('colour'),
    format: zod_1.z.enum(['pdf', 'jpeg']).default('pdf'),
    delivery: zod_1.z.enum(['whatsapp', 'email', 'download']).default('download')
});
exports.PhotocopySpecsSchema = zod_1.z.object({
    pages: zod_1.z.number(),
    copies: zod_1.z.number().default(1),
    sides: zod_1.z.enum(['single', 'double']).default('single'),
    colour: zod_1.z.enum(['bw', 'colour']).default('bw')
});
exports.TypingCustomSpecsSchema = zod_1.z.object({
    description: zod_1.z.string(),
    pagesEstimated: zod_1.z.number().default(1),
    urgency: zod_1.z.enum(['normal', 'urgent']).default('normal'),
    notes: zod_1.z.string().optional()
});
exports.OrderItemPricingSchema = zod_1.z.object({
    baseRate: zod_1.z.number().optional(),
    unitPrice: zod_1.z.number(),
    lineTotal: zod_1.z.number(),
    bwSubtotal: zod_1.z.number().optional(),
    colourSubtotal: zod_1.z.number().optional()
});
exports.OrderItemSchema = zod_1.z.object({
    id: zod_1.z.string(),
    type: exports.OrderItemTypeSchema,
    title: zod_1.z.string(),
    quantity: zod_1.z.number().default(1),
    specifications: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    computedPricing: exports.OrderItemPricingSchema,
    printInstructions: zod_1.z.string()
});
/* ─── ZCQL Table Schemas & Record Types ──────────────────────────── */
exports.OrderItemRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    order_id: zod_1.z.string(),
    kind: exports.OrderItemTypeSchema,
    status: exports.ItemStatusSchema,
    payload: zod_1.z.string(), // JSON string of specs & options
    price: zod_1.z.number(),
    file_refs: zod_1.z.string(), // JSON string array of file ids
    printer_role: zod_1.z.enum(['bw', 'colour', 'photo', 'none']).default('none'),
    created_at: zod_1.z.number(),
    printed_at: zod_1.z.number().nullable().optional(),
    delete_after: zod_1.z.number().nullable().optional(),
    files_deleted_at: zod_1.z.number().nullable().optional()
});
exports.PrintJobRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    item_id: zod_1.z.string(),
    attempt: zod_1.z.number().default(1),
    status: zod_1.z.enum(['queued', 'sending', 'printing', 'completed', 'failed']).default('queued'),
    pages_done: zod_1.z.number().default(0),
    pages_total: zod_1.z.number().default(0),
    printer: zod_1.z.string().default(''),
    error_code: zod_1.z.string().nullable().optional(),
    error_message: zod_1.z.string().nullable().optional(),
    created_at: zod_1.z.number(),
    updated_at: zod_1.z.number()
});
exports.StaffDeviceRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    token_hash: zod_1.z.string(),
    created_at: zod_1.z.number(),
    last_seen_at: zod_1.z.number(),
    revoked: zod_1.z.boolean().default(false)
});
exports.AgentDeviceRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    label: zod_1.z.string(),
    token_hash: zod_1.z.string(),
    created_at: zod_1.z.number(),
    last_seen_at: zod_1.z.number(),
    revoked: zod_1.z.boolean().default(false)
});
exports.PrinterRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    role: zod_1.z.enum(['bw', 'colour', 'photo', 'both', 'none']).default('both'),
    online: zod_1.z.boolean().default(true),
    status: zod_1.z.string().default('ready'),
    paper_info: zod_1.z.string().default('{}'), // JSON
    tray_info: zod_1.z.string().default('{}'), // JSON
    last_seen: zod_1.z.number()
});
exports.ShopSettingsRecordSchema = zod_1.z.object({
    id: zod_1.z.string().default('default'),
    rates: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    services: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    payments: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    shop_info: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    delete_delay_minutes: zod_1.z.number().default(5),
    mixed_colour_mode: zod_1.z.enum(['split', 'colour']).default('split'),
    open: zod_1.z.boolean().default(true),
    announcement: zod_1.z.string().default(''),
    updated_at: zod_1.z.number()
});
exports.OrderEventRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    order_id: zod_1.z.string(),
    item_id: zod_1.z.string().nullable().optional(),
    actor_type: zod_1.z.enum(['student', 'staff', 'agent', 'system']),
    actor_label: zod_1.z.string(),
    action: zod_1.z.string(),
    from_status: zod_1.z.string(),
    to_status: zod_1.z.string(),
    timestamp: zod_1.z.number()
});
exports.StaffActionRecordSchema = zod_1.z.object({
    id: zod_1.z.string(),
    action_type: zod_1.z.enum(['collect_cash', 'reject', 'approve_print', 'done', 'send_quote']),
    order_id: zod_1.z.string(),
    item_id: zod_1.z.string().nullable().optional(),
    payload: zod_1.z.string(), // JSON string of snapshot for UNDO
    expires_at: zod_1.z.number(),
    undone: zod_1.z.boolean().default(false),
    created_at: zod_1.z.number()
});
/* ─── State Machine & Transition Rules ───────────────────────────── */
/**
 * Orders visible on the staff counter page:
 * Only orders whose payment path is chosen and not completed/cancelled/draft.
 */
function isStaffVisibleOrder(status) {
    return [
        'pending_cash',
        'upi_claimed',
        'cash_collected',
        'processing',
        'printing',
        'ready',
        'waiting_quote',
        'quote_sent'
    ].includes(status);
}
/**
 * APPROVE & PRINT on an item is allowed only when:
 * 1. The order's payment state is verified (cash_collected, upi_claimed, or paid)
 * 2. The item status allows printing (ready_to_print, preparing, or retry after failed)
 */
function canApprovePrint(orderStatus, itemStatus) {
    const isPaidOrVerified = ['cash_collected', 'upi_claimed', 'paid'].includes(orderStatus);
    const isPrintable = ['ready_to_print', 'preparing', 'failed'].includes(itemStatus);
    return isPaidOrVerified && isPrintable;
}
/**
 * COLLECT CASH is allowed only when order is in pending_cash.
 */
function canCollectCash(orderStatus) {
    return orderStatus === 'pending_cash';
}
/**
 * Physical service DONE is allowed only when:
 * - Its linked print item is already 'printed' (or it has no linked print item)
 * - The item is not already done or cancelled
 */
function canMarkServiceDone(itemKind, itemStatus, linkedPrintStatus) {
    if (['done', 'cancelled', 'rejected'].includes(itemStatus))
        return false;
    if (linkedPrintStatus && linkedPrintStatus !== 'printed') {
        return false;
    }
    return true;
}
