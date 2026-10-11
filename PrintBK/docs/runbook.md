# PrintBK Runbook and Fallback Deployment

## Current Cloudflare Deployment (Zero-Cost)
- **Frontend**: Cloudflare Pages (GitHub Integration automatically deploying the `student/` folder using `pnpm build`).
- **Backend API**: Cloudflare Workers (`workers.dev`), backed by D1 (SQLite) and R2 (Storage).
- **Agent**: Node.js script running on the Shop PC, continually polling the API.

## Hitting Free Limits
If the shop scales beyond 100,000 Worker requests/day or the free D1 reads, PrintBK is structured to gracefully transition to a persistent VPS (e.g., $12/month DigitalOcean 2GB Droplet). 

### Docker Compose Fallback
1. Rent a Ubuntu VPS.
2. Clone this repository.
3. Replace the Cloudflare specific API wrapper in `backend/src/index.ts` with a simple Node/Express/Hono adapter (since Hono is portable, you can just use `@hono/node-server`).
4. Swap the `D1` binding with `better-sqlite3`.
5. Run `docker-compose up -d`.

### Local Print Agent Health
- If the agent crashes, ensure it restarts on boot using PM2: `pm2 start npm --name printbk-agent -- run start`.
- If LibreOffice fails, ensure the PATH is correctly linked so `soffice` resolves in the console.

## Updating Pricing / Config
To update pricing, adjust `packages/shared/src/schemas.ts` -> `defaultShopConfig`. The agent, API, and frontend inherently share this object.
