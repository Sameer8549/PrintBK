import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { priceOrder, defaultShopConfig, BasketSchema } from '@printbk/shared';
import { z } from 'zod';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/config', (c) => {
  return c.json(defaultShopConfig);
});

app.post('/upload-url', async (c) => {
  // Normally generate a presigned PUT URL for R2.
  // Wait, R2 doesn't have an in-built presigned URL in Cloudflare Workers without S3 client?
  // Actually, Cloudflare Workers can use aws4fetch or the standard R2 presigned.
  // For the sake of the minimal mock, we'll return a mock URL or just use the worker as a proxy.
  // In a real ZERO COST setup, proxying via Worker is free up to 10MB/req. Or we can use presigned URL if aws4fetch is added.
  // For this mock, proxy the upload to R2 directly.
  const id = crypto.randomUUID();
  return c.json({ url: `/upload/${id}`, id });
});

// Since proxying upload is simple:
app.put('/upload/:id', async (c) => {
  const id = c.req.param('id');
  const body = c.req.raw.body;
  if (!body) return c.json({ error: 'No body' }, 400);
  
  await c.env.BUCKET.put(`uploads/${id}`, body);
  return c.json({ success: true, id });
});

app.post('/orders', async (c) => {
  const body = await c.req.json();
  const basketResult = BasketSchema.safeParse(body);
  
  if (!basketResult.success) {
    return c.json({ error: basketResult.error }, 400);
  }
  
  const basket = basketResult.data;
  const breakdown = priceOrder(basket, defaultShopConfig);
  const orderId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const status = breakdown.quotePending ? 'waiting_quote' : 'pending_payment';
  
  await c.env.DB.prepare(
    `INSERT INTO orders (id, status, basket, breakdown, quote_pending, total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId,
    status,
    JSON.stringify(basket),
    JSON.stringify(breakdown),
    breakdown.quotePending ? 1 : 0,
    breakdown.total,
    now,
    now
  ).run();

  for (const file of basket.files) {
    await c.env.DB.prepare(
      `INSERT INTO files (id, order_id, r2_key, created_at) VALUES (?, ?, ?, ?)`
    ).bind(
      file.id,
      orderId,
      `uploads/${file.id}`,
      now
    ).run();
  }

  return c.json({ orderId, breakdown, status });
});

app.get('/orders/:id', async (c) => {
  const id = c.req.param('id');
  const order = await c.env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  
  if (!order) {
    return c.json({ error: 'Not found' }, 404);
  }
  
  return c.json({
    id: order.id,
    status: order.status,
    total: order.total,
    quote_pending: Boolean(order.quote_pending),
    basket: JSON.parse(order.basket as string),
    breakdown: JSON.parse(order.breakdown as string)
  });
});

app.post('/orders/:id/pay', async (c) => {
  const id = c.req.param('id');
  const { method } = await c.req.json(); // e.g. "manual_upi", "cash"
  const now = Math.floor(Date.now() / 1000);
  
  // Transition to processing (wait for agent to pick up)
  await c.env.DB.prepare(`UPDATE orders SET status = 'processing', updated_at = ? WHERE id = ?`).bind(now, id).run();
  
  return c.json({ success: true, status: 'processing' });
});

// Agent API to list pending orders
app.get('/agent/orders', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM orders WHERE status = 'processing' ORDER BY created_at ASC`).all();
  return c.json(results);
});

// Agent API to update status
app.post('/agent/orders/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  const now = Math.floor(Date.now() / 1000);
  
  let printedAt = null;
  if (status === 'completed') {
    printedAt = now;
    await c.env.DB.prepare(`UPDATE orders SET status = ?, updated_at = ?, printed_at = ? WHERE id = ?`).bind(status, now, printedAt, id).run();
  } else {
    await c.env.DB.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id).run();
  }
  
  return c.json({ success: true });
});

// Agent API to get file
app.get('/agent/files/:id', async (c) => {
  const id = c.req.param('id');
  const object = await c.env.BUCKET.get(`uploads/${id}`);
  if (!object) return c.json({ error: 'Not found' }, 404);
  
  c.header('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  return c.body(object.body);
});

export default {
  fetch: app.fetch,
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const delaySecs = defaultShopConfig.autoDeleteDelay * 60;
    const cutoff = Math.floor(Date.now() / 1000) - delaySecs;
    
    // Find completed orders past cutoff
    const { results } = await env.DB.prepare(`SELECT id FROM orders WHERE status = 'completed' AND printed_at <= ?`).bind(cutoff).all();
    
    for (const order of results) {
      // Find files
      const files = await env.DB.prepare(`SELECT id, r2_key FROM files WHERE order_id = ? AND deleted = 0`).bind(order.id).all();
      
      for (const file of files.results) {
        await env.BUCKET.delete(file.r2_key as string);
        await env.DB.prepare(`UPDATE files SET deleted = 1 WHERE id = ?`).bind(file.id).run();
      }
    }
  }
};
