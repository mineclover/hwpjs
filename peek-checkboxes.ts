/**
 * 체크박스 미탐지 파일들의 이론/실습/사례 행 전체 셀 값 출력
 */
import * as fs from 'fs';
import * as path from 'path';
import * as hwpjs from './packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
} from './packages/hwpjs/src/table-schema';

const PROBLEM_FILES = [
  '009. 강의계획서_건축설계도서 구성부터 작성까지_양지호.hwp',
  '020. 강의계획서_인공지능 자연어 처리_안상선.hwp.hwp',
  '027. 강의계획서_처음 배우는 전기동력자동차 개론_김용현.hwp',
];

for (const fname of PROBLEM_FILES) {
  console.log(`\n${'='.repeat(60)}\n${fname}\n${'='.repeat(60)}`);
  const buf = new Uint8Array(fs.readFileSync(path.join('./pipeline/hwp', fname)));
  const json = JSON.parse(hwpjs.toJson(buf));
  const schemas = extractAllTableSchemas(transformHwpTablesWithSchema(json.body_text));

  let shown = 0;
  for (const schema of schemas) {
    for (const row of schema.rows) {
      const vals = row.cells.map((c) => String(c.value ?? ''));
      if (!vals.some((v) => v.includes('이론/실습/사례'))) continue;
      if (shown >= 3) break;

      console.log(`\n[행 ${shown + 1}] 셀 ${vals.length}개:`);
      vals.forEach((v, i) => {
        const display = v.replace(/\n/g, '↵').trim();
        const hasCb = /[☑■▢□]/.test(v);
        console.log(`  [${i}] ${hasCb ? '/cb/' : '     '} ${JSON.stringify(display)}`);
      });
      shown++;
    }
  }
}
