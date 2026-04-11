const fs = require('fs');
const data = fs.readFileSync('C:/Users/me/Downloads/lotro-data-master/lotro-data-master/lore/legendaryAttributes.xml', 'utf8');
const items = data.match(/<socketsSetup[^>]*>[\s\S]*?<\/socketsSetup>/g);
console.log('Total LI socket setups:', items.length);

const byType = {};
const itemConfigs = [];
for (const item of items) {
  const idm = item.match(/itemId="(\d+)"/);
  const sockets = item.match(/<socketSetup[^/]*\/>/g) || [];
  const config = [];
  for (const s of sockets) {
    const tm = s.match(/type="(\d+)"/);
    const lm = s.match(/unlockLevel="(\d+)"/);
    if (tm && lm) {
      const type = parseInt(tm[1]);
      const level = parseInt(lm[1]);
      config.push({ type, level });
      if (!byType[type]) byType[type] = new Set();
      byType[type].add(level);
    }
  }
  itemConfigs.push({ id: idm ? idm[1] : '?', sockets: config });
}

// Socket type names
const TYPES = { 3: 'Heraldic', 4: 'Word of Power', 5: 'Word of Craft',
  6: 'WoM:Beorning', 7: 'WoM:Brawler', 8: 'WoM:Burglar', 9: 'WoM:Captain',
  10: 'WoM:Champion', 11: 'WoM:Guardian', 12: 'WoM:Hunter', 13: 'WoM:LM',
  14: 'WoM:Minstrel', 15: 'WoM:RK', 16: 'WoM:Warden', 21: 'WoM:Mariner' };

console.log('\n=== Unlock item levels by socket type ===');
for (const [type, levels] of Object.entries(byType).sort((a,b) => a-b)) {
  const sorted = Array.from(levels).sort((a, b) => a - b);
  console.log(`Type ${type} (${TYPES[type] || '?'}): ${sorted.join(', ')}`);
}

// Show first few item configs as examples
console.log('\n=== Sample item socket configs ===');
for (let i = 0; i < 3 && i < itemConfigs.length; i++) {
  const c = itemConfigs[i];
  console.log(`Item ${c.id}:`);
  c.sockets.forEach((s, j) => console.log(`  Slot ${j+1}: ${TYPES[s.type] || 'type'+s.type} @ item level ${s.level}`));
}

// Find most common configurations
const configSigs = {};
for (const c of itemConfigs) {
  const sig = c.sockets.map(s => s.type + '@' + s.level).join('|');
  if (!configSigs[sig]) configSigs[sig] = { count: 0, example: c };
  configSigs[sig].count++;
}
const sorted = Object.values(configSigs).sort((a, b) => b.count - a.count);
console.log('\n=== Most common socket configurations ===');
for (let i = 0; i < 5; i++) {
  const s = sorted[i];
  console.log(`\nConfig (${s.count} items), example item ${s.example.id}:`);
  s.example.sockets.forEach((slot, j) => console.log(`  Slot ${j+1}: ${TYPES[slot.type] || 'type'+slot.type} @ item level ${slot.level}`));
}
