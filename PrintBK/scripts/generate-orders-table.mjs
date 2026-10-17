import fs from 'node:fs';

const orders = JSON.parse(fs.readFileSync('scripts/unflagged-orders.json', 'utf8'));

let md = '# Unflagged Orders Review Table\n\n';
md += 'The following 39 orders remain in the database. Per the GSD Working Rules, **no non-test data may be deleted without explicit user confirmation**.\n\n';
md += '| # | Order ID | Order Number | Status | Files | Created At (UTC) |\n';
md += '|---|---|---|---|---|---|\n';

orders.forEach((o, idx) => {
  const dateStr = o.createdAt ? new Date(Number(o.createdAt) * 1000).toISOString().replace('T', ' ').slice(0, 19) : '—';
  const filesStr = (o.files || []).join(', ') || '—';
  md += `| ${idx + 1} | \`${o.id}\` | **${o.num || 'None'}** | \`${o.status}\` | ${filesStr} | ${dateStr} |\n`;
});

fs.writeFileSync('docs/unflagged-orders-candidate-table.md', md);
console.log('Generated docs/unflagged-orders-candidate-table.md with', orders.length, 'orders.');
