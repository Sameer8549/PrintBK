import { z } from 'zod';

export const ShopConfigSchema = z.object({
  rates: z.object({
    bw: z.number().default(1.50),
    color: z.number().default(8.00),
    scan: z.number().optional().default(5),
    scanPerPage: z.number().optional(),
    photocopy: z.number().optional().default(1.50),
    copyBw: z.number().optional(),
    copyColour: z.number().optional(),
    doubleSideDiscount: z.number().optional().default(0.4333),
    duplex: z.number().optional(),
    bulkTierThreshold: z.number().optional().default(100),
    bulkTierRate: z.number().optional().default(0.80),
    paperMultipliers: z.object({
      A4: z.number().default(1),
      A3: z.number().default(2),
      Legal: z.number().default(1.2),
      Glossy: z.number().optional().default(2.0),
    }).default({ A4: 1, A3: 2, Legal: 1.2, Glossy: 2.0 }),
    staple: z.number().optional().default(5),
    spiral: z.number().optional().default(30),
    bindingSpiral: z.number().optional(),
    comb: z.number().optional().default(25),
    hardCover: z.number().optional().default(150),
    bindingHard: z.number().optional(),
    bindingSoft: z.number().optional(),
    laminationID: z.number().optional().default(10),
    laminationA4: z.number().optional().default(25),
    laminationA3: z.number().optional().default(50),
    laminationThickExtra: z.number().optional().default(5),
    photoPassport: z.number().optional().default(40),
    photo4x6: z.number().optional().default(30),
    photo8x10: z.number().optional().default(50),
    photoRates: z.record(z.string(), z.number()).optional().default({
      'Passport 8-up': 40,
      '4×6': 30,
      '1': 10,
      '2': 15,
      '4': 20,
      'ID card': 20,
      'Aadhaar': 20,
      'Resume': 10,
      'Custom': 25,
    }),
    rushSurcharge: z.number().optional().default(0.15),
    gatewayFee: z.number().default(0)
  }).passthrough(),
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
  cloudId: z.string().optional(),
  isPhotoSheet: z.boolean().optional(),
  photoLayout: z.string().optional(),
  photoUnitPrice: z.number().optional(),
  previewUrl: z.string().optional(),
  settings: z.object({
    copies: z.number().default(1),
    colorMode: z.enum(['bw', 'color', 'colour', 'auto', 'custom']).default('bw'),
    colorPlan: ColorPlanSchema.optional(),
    sided: z.enum(['single', 'double']).default('single'),
    paper: z.enum(['A4', 'A3', 'Legal', 'Glossy']).default('A4'),
    orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto'),
    nUp: z.number().default(1),
    layout: z.enum(['standard', 'handout', 'booklet']).default('standard'),
    booklet: z.boolean().default(false),
    range: z.string().default('all'),
    pageRotations: z.record(z.string(), z.number()).optional().default({}),
    duplexEdge: z.enum(['long', 'short']).optional(),
    imageFit: z.enum(['fit', 'fill']).optional()
  })
}).passthrough();
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
  'pending_payment', 'pending_cash', 'upi_started', 'upi_claimed', 'cash_collected', 'waiting_quote', 'quote_sent', 'accepted', 'declined', 
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
  'typing_request',
  'typing_custom'
]);
export type OrderItemType = z.infer<typeof OrderItemTypeSchema>;

export const ItemStatusSchema = z.enum([
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
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const DocumentBwSpecsSchema = z.object({
  pages: z.number(),
  copies: z.number().default(1),
  sides: z.enum(['single', 'double']).default('single'),
  paper: z.enum(['A4', 'A3', 'Legal', 'Glossy']).default('A4'),
  orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto'),
  nUp: z.number().default(1),
  duplexEdge: z.enum(['long', 'short']).optional(),
  fileId: z.string(),
  cloudId: z.string().optional(),
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
  fileId: z.string().optional(),
  cloudId: z.string().optional()
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

/* ─── ZCQL Table Schemas & Record Types ──────────────────────────── */

export const OrderItemRecordSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  kind: OrderItemTypeSchema,
  status: ItemStatusSchema,
  payload: z.string(), // JSON string of specs & options
  price: z.number(),
  file_refs: z.string(), // JSON string array of file ids
  printer_role: z.enum(['bw', 'colour', 'photo', 'none']).default('none'),
  created_at: z.number(),
  printed_at: z.number().nullable().optional(),
  delete_after: z.number().nullable().optional(),
  files_deleted_at: z.number().nullable().optional()
});
export type OrderItemRecord = z.infer<typeof OrderItemRecordSchema>;

export const PrintJobRecordSchema = z.object({
  id: z.string(),
  item_id: z.string(),
  attempt: z.number().default(1),
  status: z.enum(['queued', 'sending', 'printing', 'completed', 'failed']).default('queued'),
  pages_done: z.number().default(0),
  pages_total: z.number().default(0),
  printer: z.string().default(''),
  error_code: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  created_at: z.number(),
  updated_at: z.number()
});
export type PrintJobRecord = z.infer<typeof PrintJobRecordSchema>;

export const StaffDeviceRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  token_hash: z.string(),
  created_at: z.number(),
  last_seen_at: z.number(),
  revoked: z.boolean().default(false)
});
export type StaffDeviceRecord = z.infer<typeof StaffDeviceRecordSchema>;

export const AgentDeviceRecordSchema = z.object({
  id: z.string(),
  label: z.string(),
  token_hash: z.string(),
  created_at: z.number(),
  last_seen_at: z.number(),
  revoked: z.boolean().default(false)
});
export type AgentDeviceRecord = z.infer<typeof AgentDeviceRecordSchema>;

export const PrinterRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['bw', 'colour', 'photo', 'both', 'none']).default('both'),
  online: z.boolean().default(true),
  status: z.string().default('ready'),
  paper_info: z.string().default('{}'), // JSON
  tray_info: z.string().default('{}'),  // JSON
  last_seen: z.number()
});
export type PrinterRecord = z.infer<typeof PrinterRecordSchema>;

export const ShopSettingsRecordSchema = z.object({
  id: z.string().default('default'),
  rates: z.record(z.string(), z.any()),
  services: z.record(z.string(), z.any()),
  payments: z.record(z.string(), z.any()),
  shop_info: z.record(z.string(), z.any()),
  delete_delay_minutes: z.number().default(5),
  mixed_colour_mode: z.enum(['split', 'colour']).default('split'),
  open: z.boolean().default(true),
  announcement: z.string().default(''),
  updated_at: z.number()
});
export type ShopSettingsRecord = z.infer<typeof ShopSettingsRecordSchema>;

export const OrderEventRecordSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  item_id: z.string().nullable().optional(),
  actor_type: z.enum(['student', 'staff', 'agent', 'system']),
  actor_label: z.string(),
  action: z.string(),
  from_status: z.string(),
  to_status: z.string(),
  timestamp: z.number()
});
export type OrderEventRecord = z.infer<typeof OrderEventRecordSchema>;

export const StaffActionRecordSchema = z.object({
  id: z.string(),
  action_type: z.enum(['collect_cash', 'reject', 'approve_print', 'done', 'send_quote']),
  order_id: z.string(),
  item_id: z.string().nullable().optional(),
  payload: z.string(), // JSON string of snapshot for UNDO
  expires_at: z.number(),
  undone: z.boolean().default(false),
  created_at: z.number()
});
export type StaffActionRecord = z.infer<typeof StaffActionRecordSchema>;

/* ─── State Machine & Transition Rules ───────────────────────────── */

/**
 * Orders visible on the staff counter page:
 * Only orders whose payment path is chosen and not completed/cancelled/draft.
 */
export function isStaffVisibleOrder(status: OrderStatus): boolean {
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
export function canApprovePrint(orderStatus: OrderStatus, itemStatus: ItemStatus): boolean {
  const isPaidOrVerified = ['cash_collected', 'upi_claimed', 'paid'].includes(orderStatus);
  const isPrintable = ['ready_to_print', 'preparing', 'failed'].includes(itemStatus);
  return isPaidOrVerified && isPrintable;
}

/**
 * COLLECT CASH is allowed only when order is in pending_cash.
 */
export function canCollectCash(orderStatus: OrderStatus): boolean {
  return orderStatus === 'pending_cash';
}

/**
 * Physical service DONE is allowed only when:
 * - Its linked print item is already 'printed' (or it has no linked print item)
 * - The item is not already done or cancelled
 */
export function canMarkServiceDone(
  itemKind: OrderItemType,
  itemStatus: ItemStatus,
  linkedPrintStatus?: ItemStatus
): boolean {
  if (['done', 'cancelled', 'rejected'].includes(itemStatus)) return false;
  if (linkedPrintStatus && linkedPrintStatus !== 'printed') {
    return false;
  }
  return true;
}

