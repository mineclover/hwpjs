import { toJson } from '../packages/hwpjs/dist/index.js';
import * as fs from 'fs';

const buf = fs.readFileSync(
  'D:/woo-work/hwp-pipe/001. 강의계획서_Master-K 기반 PLC 제어 기초_송석환.hwp'
);
const json = JSON.parse(toJson(buf));
const rawParas = json.body_text.sections[0].paragraphs;

function runsText(p: any): string {
  return (p?.records ?? [])
    .filter((r: any) => r.type === 'para_text')
    .flatMap((r: any) => r.runs ?? [])
    .filter((r: any) => r.kind === 'text')
    .map((r: any) =>
      String(r.text ?? '')
        .replace(/[\x00-\x1F]/g, '')
        .trim()
    )
    .filter(Boolean)
    .join('');
}

// para[23]~[26]
console.log('=== para[23]~[26] 분석 ===');
for (let i = 23; i <= 26; i++) {
  const p = rawParas[i];
  const recTypes = (p.records ?? []).map((r: any) => r.type);
  console.log(`\npara[${i}] records: ${recTypes.join(', ')}`);
  for (const rec of p.records ?? []) {
    if (rec.type === 'ctrl_header') {
      console.log(
        `  ctrl_id: "${rec.ctrl_id}" | paras: ${rec.paragraphs?.length ?? 0} | children: ${rec.children?.length ?? 0}`
      );
      for (const cp of rec.paragraphs ?? []) {
        const t = runsText(cp);
        if (t) console.log(`    -> "${t.slice(0, 80)}"`);
      }
    }
  }
}

// para[2] TABLE×2
console.log('\n=== para[2] tbl ctrl_headers ===');
const p2 = rawParas[2];
let idx = 0;
for (const rec of p2.records ?? []) {
  if (rec.type === 'ctrl_header' && rec.ctrl_id?.trim() === 'tbl') {
    const cells = rec.children?.[0]?.table?.cells?.length ?? 0;
    const flat = rec.paragraphs?.length ?? 0;
    const first = runsText(rec.paragraphs?.[0]);
    console.log(`  tbl[${idx}]: cells=${cells} flat=${flat} 첫텍스트="${first.slice(0, 40)}"`);
    idx++;
  }
}
