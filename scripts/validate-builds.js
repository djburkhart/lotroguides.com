const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data', 'builds');

for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.json')) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const ids = new Set();
  let tc = 0, dc = 0;
  for (const t of d.trees) {
    for (const tr of t.traits) {
      ids.add(tr.id);
      tc++;
      if (tr.deps) dc += tr.deps.length;
    }
  }
  const bad = [];
  for (const [k, b] of Object.entries(d.builds)) {
    if (b.points) {
      for (const id of Object.keys(b.points)) {
        if (!ids.has(id)) bad.push(k + ':' + id);
      }
    }
  }
  console.log(f.replace('.json', ''), tc + 't', dc + 'd', bad.length ? 'BAD: ' + bad.join(', ') : 'OK');
}
