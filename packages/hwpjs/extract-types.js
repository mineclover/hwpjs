const fs = require('fs');
const json = JSON.parse(fs.readFileSync('test-output.json'));

// 모든 record 타입별 샘플 수집
const samples = {};
function collectSamples(records, depth = 0) {
  if (!records || depth > 5) return;
  for (const r of records) {
    const type = r.type;
    if (type && !samples[type]) {
      samples[type] = JSON.parse(JSON.stringify(r, (k, v) => {
        if (k === 'children' && Array.isArray(v)) return '[' + v.length + ' children]';
        if (k === 'paragraphs' && Array.isArray(v)) return '[' + v.length + ' paragraphs]';
        if (k === 'text' && typeof v === 'string' && v.length > 30) return v.slice(0, 30) + '...';
        if (k === 'data' && typeof v === 'string' && v.length > 30) return v.slice(0, 30) + '...';
        return v;
      }));
    }
    if (r.children) collectSamples(r.children, depth + 1);
    if (r.paragraphs) {
      for (const p of r.paragraphs) {
        if (p.records) collectSamples(p.records, depth + 1);
      }
    }
  }
}

for (const section of json.body_text.sections) {
  for (const para of section.paragraphs) {
    collectSamples(para.records);
  }
}

console.log('=== Record Types Found ===');
console.log(Object.keys(samples));

console.log('\n=== Sample per Type ===');
for (const [type, sample] of Object.entries(samples)) {
  console.log('\n---', type, '---');
  console.log(JSON.stringify(sample, null, 2).slice(0, 1000));
}
