import { z } from 'zod';

export const ShopConfigSchema = z.object({
  rates: z.object({
    bw: z.number(),
    color: z.number(),
    scan: z.number(),
    photocopy: z.number(),
    doubleSideDiscount: z.number(),
    bulkTierThreshold: z.number(),
    bulkTierRate: z.number(),
    paperMultipliers: z.object({
      A4: z.number(),
      A3: z.number(),
      Legal: z.number(),
    }),
    staple: z.number(),
    spiral: z.number(),
    comb: z.number(),
    hardCover: z.number(),
    laminationID: z.number(),
    laminationA4: z.number(),
    laminationA3: z.number(),
    laminationThickExtra: z.number(),
    rushSurcharge: z.number(),
    gatewayFee: z.number().default(0)
  }),
  rushEnabled: z.boolean().default(false),
  maxFileMB: z.number().default(25),
  autoDeleteDelay: z.number().default(5)
});

export type ShopConfig = z.infer<typeof ShopConfigSchema>;


export const ColorPlanSchema = z.object({
  mode: z.enum(['bw', 'colour', 'color', 'auto', 'custom']).default('bw'),
  colorPages: z.array(z.number()).default([])
});
export type ColorPlan = z.infer<typeof ColorPlanSchema>;

export const PrintFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  pages: z.number(),
  colorPages: z.number().default(0),
  colorDetection: z.enum(['pending', 'done', 'failed', 'na']).default('na'),
  pageMetrics: z.array(z.object({
    pageNumber: z.number(),
    width: z.number(),
    height: z.number(),
    rotation: z.number().optional()
  })).optional(),
  settings: z.object({
    copies: z.number().default(1),
    colorMode: z.enum(['bw', 'color', 'colour', 'auto', 'custom']).default('bw'),
    colorPlan: ColorPlanSchema.optional(),
    sided: z.enum(['single', 'double']).default('single'),
    paper: z.enum(['A4', 'A3', 'Legal']).default('A4'),
    orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto'),
    nUp: z.number().default(1),
    layout: z.enum(['standard', 'handout', 'booklet']).default('standard'),
    booklet: z.boolean().default(false),
    range: z.string().default('all'),
    pageRotations: z.record(z.string(), z.number()).optional().default({}),
    duplexEdge: z.enum(['long', 'short']).optional()
  })
});
export type PrintFile = z.infer<typeof PrintFileSchema>;

export const ServiceLineSchema = z.object({
  id: z.string(),
  type: z.enum(['addon', 'walkin', 'request']),
  name: z.string(),
  price: z.number().optional(),
  qty: z.number().default(1),
  attachTo: z.string().optional(),
  detail: z.string().optional(),
  counterNote: z.string().optional()
});
export type ServiceLine = z.infer<typeof ServiceLineSchema>;

export const BasketSchema = z.object({
  files: z.array(PrintFileSchema),
  services: z.array(ServiceLineSchema),
  rush: z.boolean().default(false)
});
export type Basket = z.infer<typeof BasketSchema>;

export const OrderStatusSchema = z.enum([
  'pending_payment', 'pending_cash', 'upi_started', 'upi_claimed', 'waiting_quote', 'quote_sent', 'accepted', 'declined', 
  'paid', 'processing', 'printing', 'ready', 'completed', 'cancelled', 'rejected', 'failed', 'refunded', 'expired'
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/* ─── Typed Order Items for Staff App Tables ──────────────────────── */
export const OrderItemTypeSchema = z.enum([
  'document_bw',
  'document_colour',
  'photo',
  'binding',
  'lamination',
  'scanning',
  'photocopy',
  'typing_custom'
]);
export type OrderItemType = z.infer<typeof OrderItemTypeSchema>;

export const DocumentBwSpecsSchema = z.object({
  pages: z.number(),
  copies: z.number().default(1),
  sides: z.enum(['single', 'double']).default('single'),
  paper: z.enum(['A4', 'A3', 'Legal']).default('A4'),
  orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto'),
  nUp: z.number().default(1),
  duplexEdge: z.enum(['long', 'short']).optional(),
  fileId: z.string(),
  originalFilename: z.string(),
  layout: z.enum(['standard', 'handout', 'booklet']).default('standard')
});
export type DocumentBwSpecs = z.infer<typeof DocumentBwSpecsSchema>;

export const DocumentColourSpecsSchema = DocumentBwSpecsSchema.extend({
  colorPlan: ColorPlanSchema,
  bwPagesCount: z.number(),
  colourPagesCount: z.number()
});
export type DocumentColourSpecs = z.infer<typeof DocumentColourSpecsSchema>;

export const PhotoSpecsSchema = z.object({
  size: z.enum(['passport', 'stamp', '4x6', '5x7', 'A4']),
  paperType: z.enum(['glossy', 'matte']).default('glossy'),
  copies: z.number().default(1),
  fileId: z.string().optional()
});
export type PhotoSpecs = z.infer<typeof PhotoSpecsSchema>;

export const BindingSpecsSchema = z.object({
  kind: z.enum(['soft', 'spiral', 'hard']),
  pageCount: z.number(),
  colorCover: z.boolean().default(false),
  attachedToFileId: z.string().optional()
});
export type BindingSpecs = z.infer<typeof BindingSpecsSchema>;

export const LaminationSpecsSchema = z.object({
  size: z.enum(['ID', 'A4', 'A3']),
  thickness: z.enum(['standard', 'thick']).default('standard'),
  quantity: z.number().default(1),
  attachedToFileId: z.string().optional()
});
export type LaminationSpecs = z.infer<typeof LaminationSpecsSchema>;

export const ScanningSpecsSchema = z.object({
  pages: z.number(),
  dpi: z.number().default(300),
  colour: z.enum(['bw', 'colour']).default('colour'),
  format: z.enum(['pdf', 'jpeg']).default('pdf'),
  delivery: z.enum(['whatsapp', 'email', 'download']).default('download')
});
export type ScanningSpecs = z.infer<typeof ScanningSpecsSchema>;

export const PhotocopySpecsSchema = z.object({
  pages: z.number(),
  copies: z.number().default(1),
  sides: z.enum(['single', 'double']).default('single'),
  colour: z.enum(['bw', 'colour']).default('bw')
});
export type PhotocopySpecs = z.infer<typeof PhotocopySpecsSchema>;

export const TypingCustomSpecsSchema = z.object({
  description: z.string(),
  pagesEstimated: z.number().default(1),
  urgency: z.enum(['normal', 'urgent']).default('normal'),
  notes: z.string().optional()
});
export type TypingCustomSpecs = z.infer<typeof TypingCustomSpecsSchema>;

export const OrderItemPricingSchema = z.object({
  baseRate: z.number().optional(),
  unitPrice: z.number(),
  lineTotal: z.number(),
  bwSubtotal: z.number().optional(),
  colourSubtotal: z.number().optional()
});
export type OrderItemPricing = z.infer<typeof OrderItemPricingSchema>;

export const OrderItemSchema = z.object({
  id: z.string(),
  type: OrderItemTypeSchema,
  title: z.string(),
  quantity: z.number().default(1),
  specifications: z.record(z.string(), z.any()),
  computedPricing: OrderItemPricingSchema,
  printInstructions: z.string()
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

