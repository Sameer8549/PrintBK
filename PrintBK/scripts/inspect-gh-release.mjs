import { execSync } from 'node:child_process';

function resolveToken() {
  const direct = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (direct) return direct;
  try {
    const input = 'protocol=https\nhost=github.com\n\n';
    const output = execSync('git credential fill', { input, encoding: 'utf8' });
    for (const line of output.split('\n')) {
      if (line.startsWith('password=')) return line.substring(9).trim();
    }
  } catch (err) {}
  return null;
}

const token = resolveToken();
console.log('Token resolved:', token ? 'YES (length ' + token.length + ')' : 'NO');

async function check() {
  const res = await fetch('https://api.github.com/repos/Sameer8549/PrintBK-releases/releases/tags/v1.0.0', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'PrintBK-Inspector'
    }
  });
  if (!res.ok) {
    console.log('Failed to fetch release:', res.status, await res.text());
    return;
  }
  const rel = await res.json();
  console.log(`Release ID: ${rel.id}, Tag: ${rel.tag_name}, Name: ${rel.name}`);
  console.log('Assets count:', rel.assets?.length);
  for (const a of (rel.assets || [])) {
    console.log(` - ID: ${a.id}, Name: ${a.name}, Size: ${(a.size / (1024*1024)).toFixed(2)} MB (${a.size} bytes), State: ${a.state}`);
  }
}

check();
