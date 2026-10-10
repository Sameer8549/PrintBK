
export type Screen = 'splash' | 'entry' | 'uploading' | 'basket' | 'empty' | 'preview' | 'services' | 'photo' | 'checkout' | 'confirming' | 'failed' | 'paid' | 'ticket' | 'quoteTicket' | 'orderError' | 'history' | 'settings' | string;
export type Sheet = 'settings' | 'picker' | 'breakdown' | 'receipt' | 'report' | 'binding' | 'lamination' | 'scanning' | 'typing' | 'custom' | string | null;

export interface ServiceItem {
  id: string;
  type: string;
  name: string;
  price?: number;
  qty?: number;
  status?: string;
  color?: string;
  detail?: string;
  mode?: string;
  label?: string;
  attachTo?: string;
  counterNote?: string;
}
