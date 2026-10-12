"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderItemSchema = exports.OrderItemPricingSchema = exports.TypingCustomSpecsSchema = exports.PhotocopySpecsSchema = exports.ScanningSpecsSchema = exports.LaminationSpecsSchema = exports.BindingSpecsSchema = exports.PhotoSpecsSchema = exports.DocumentColourSpecsSchema = exports.DocumentBwSpecsSchema = exports.OrderItemTypeSchema = exports.OrderStatusSchema = exports.BasketSchema = exports.ServiceLineSchema = exports.PrintFileSchema = exports.ColorPlanSchema = exports.ShopConfigSchema = void 0;
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
    'pending_payment', 'pending_cash', 'upi_started', 'upi_claimed', 'waiting_quote', 'quote_sent', 'accepted', 'declined',
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
    'typing_custom'
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
