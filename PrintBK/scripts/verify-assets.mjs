async function test() {
  console.log('--- Checking Student Assets ---');
  let base = 'https://printbk-60074625517.development.catalystserverless.in/app/index.html';
  let html = await (await fetch(base)).text();
  let regex = /\.\/assets\/[^"' >]+/g;
  let matches = [...new Set(html.match(regex) || [])];
  for (const asset of matches) {
    const url = new URL(asset, base).href;
    const res = await fetch(url);
    console.log(asset.padEnd(40), res.status, res.headers.get('content-type'));
  }

  console.log('\n--- Checking Staff Assets ---');
  base = 'https://printbk-60074625517.development.catalystserverless.in/app/staff/index.html';
  html = await (await fetch(base)).text();
  matches = [...new Set(html.match(regex) || [])];
  for (const asset of matches) {
    const url = new URL(asset, base).href;
    const res = await fetch(url);
    console.log(asset.padEnd(40), res.status, res.headers.get('content-type'));
  }

  console.log('\n--- Checking Version API ---');
  const verRes = await fetch('https://printbk-60074625517.development.catalystserverless.in/server/api/counter/version');
  const verData = await verRes.json();
  console.log('fileSize:', verData.fileSize);
  console.log('fileSizeBytes:', verData.fileSizeBytes);
  console.log('sha256:', verData.sha256);
  console.log('downloadUrl:', verData.downloadUrl);
}
test();
