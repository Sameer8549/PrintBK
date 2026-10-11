"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderStatusSchema = exports.BasketSchema = exports.ServiceLineSchema = exports.PrintFileSchema = exports.ShopConfigSchema = void 0;
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
exports.PrintFileSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    size: zod_1.z.number(),
    type: zod_1.z.string(),
    pages: zod_1.z.number(),
    colorPages: zod_1.z.number().default(0),
    colorDetection: zod_1.z.enum(['pending', 'done', 'failed', 'na']).default('na'),
    settings: zod_1.z.object({
        copies: zod_1.z.number().default(1),
        colorMode: zod_1.z.enum(['bw', 'color', 'auto']).default('bw'),
        sided: zod_1.z.enum(['single', 'double']).default('single'),
        paper: zod_1.z.enum(['A4', 'A3', 'Legal']).default('A4'),
        orientation: zod_1.z.enum(['portrait', 'landscape', 'auto']).default('auto'),
        nUp: zod_1.z.number().default(1),
        booklet: zod_1.z.boolean().default(false),
        range: zod_1.z.string().default('all')
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
    'pending_payment', 'waiting_quote', 'quote_sent', 'accepted', 'declined',
    'paid', 'processing', 'ready', 'completed', 'failed', 'refunded'
]);
