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

export const defaultShopConfig: ShopConfig = {
  rates: {
    bw: 1,
    color: 5,
    scan: 5,
    photocopy: 1,
    doubleSideDiscount: 0.2, // 20%
    bulkTierThreshold: 100,
    bulkTierRate: 0.8,
    paperMultipliers: { A4: 1, A3: 2, Legal: 1.2 },
    staple: 5,
    spiral: 30,
    comb: 25,
    hardCover: 150,
    laminationID: 10,
    laminationA4: 25,
    laminationA3: 50,
    laminationThickExtra: 5,
    rushSurcharge: 0.15,
    gatewayFee: 0
  },
  rushEnabled: false,
  maxFileMB: 25,
  autoDeleteDelay: 5
};

export const PrintFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number(),
  type: z.string(),
  pages: z.number(),
  colorPages: z.number().default(0),
  colorDetection: z.enum(['pending', 'done', 'failed', 'na']).default('na'),
  settings: z.object({
    copies: z.number().default(1),
    colorMode: z.enum(['bw', 'color', 'auto']).default('bw'),
    sided: z.enum(['single', 'double']).default('single'),
    paper: z.enum(['A4', 'A3', 'Legal']).default('A4'),
    orientation: z.enum(['portrait', 'landscape', 'auto']).default('auto'),
    nUp: z.number().default(1),
    booklet: z.boolean().default(false),
    range: z.string().default('all')
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
  'pending_payment', 'waiting_quote', 'quote_sent', 'accepted', 'declined', 
  'paid', 'processing', 'ready', 'completed', 'failed', 'refunded'
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
