/**
 * ktechTableSpecs collect_pattern 검증
 *
 * 각 CDMS-매핑 HWP 파일에서 TableSchema[]를 수집하고
 * collectWithSpecs()로 유형별 매칭 결과 + 미매칭 테이블을 출력한다.
 */
import { toJson } from '../packages/hwpjs/dist/index.js';
import { transformHwpTablesWithSchema } from '../packages/hwpjs-adapter/src/table-schema.js';
import { collectWithSpecs } from '../packages/hwpjs-adapter/src/collection/index.js';
import type { TableSchema } from '../packages/hwpjs-adapter/src/table-schema.js';
import { ktechTableSpecs } from '../usecase/ktech/ktech-table-specs.js';
import * as fs from 'fs';
import * as path from 'path';

const hwpDir  = 'D:/woo-work/hwp-pipe';
const csvPath = 'D:/woo-work/hwp-pipe-output/cdms-hwp-mapping.csv';

// ─── CSV 파싱 ────────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '', inQuote = false;
  for (const c of line) {
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { fields.push(cur); cur = ''; }
    else cur += c;
  }
  fields.push(cur);
  return fields.map(f => f.trim().replace(/^"|"$/g, ''));
}

// ─── TableSchema[] 수집 ──────────────────────────────────────────────────────

function collectAllSchemas(obj: unknown, out: TableSchema[] = []): TableSchema[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(v => collectAllSchemas(v, out)); return out; }
  const rec = obj as Record<string, unknown>;
  if ('tableSchema' in rec) { out.push(rec['tableSchema'] as TableSchema); return out; }
  for (const v of Object.values(rec)) collectAllSchemas(v, out);
  return out;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

const csvLines = fs.readFileSync(csvPath, 'utf-8')
  .split('\n').slice(1).filter(Boolean);

interface FileResult {
  cdms: string;
  title: string;
  totalTables: number;
  matched: Array<{ type: string; idx: number; size: string; matched_text?: string }>;
  unmatched: Array<{ idx: number; size: string; preview: string }>;
  error?: string;
}

const results: FileResult[] = [];

// 유형별 집계
const typeCount: Record<string, number> = {};
for (const spec of ktechTableSpecs) typeCount[spec.def.name] = 0;

let ok = 0, fail = 0;

for (const line of csvLines) {
  const cols  = parseCsvLine(line);
  const cdms  = cols[0];
  const file  = cols[1];
  const title = cols[2] ?? '';
  const hwpPath = path.join(hwpDir, file);

  process.stdout.write(`[${cdms}] ${file.slice(0, 40).padEnd(40)} `);

  if (!fs.existsSync(hwpPath)) {
    console.log('SKIP');
    fail++;
    results.push({ cdms, title, totalTables: 0, matched: [], unmatched: [], error: 'file not found' });
    continue;
  }

  try {
    const buf     = fs.readFileSync(hwpPath);
    const hwpJson = JSON.parse(toJson(buf));
    const body    = hwpJson?.body_text;
    const transformed = transformHwpTablesWithSchema(body);
    const schemas = collectAllSchemas(transformed);

    const matchedSet = new Set<number>();
    const collected  = collectWithSpecs(schemas, ktechTableSpecs);

    const matched = collected.map(c => {
      matchedSet.add(c.table_index);
      typeCount[c.table_type] = (typeCount[c.table_type] ?? 0) + 1;
      const s = schemas[c.table_index];
      return {
        type: c.table_type,
        idx:  c.table_index,
        size: `${s.rows.length}x${s.rows[0]?.cells.length ?? 0}`,
        matched_text: c.match_info.matched_text?.slice(0, 20),
      };
    });

    const unmatched = schemas
      .map((s, i) => ({ i, s }))
      .filter(({ i }) => !matchedSet.has(i))
      .map(({ i, s }) => {
        const firstVal = s.rows[0]?.cells[0]?.value;
        const preview  = String(firstVal ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
        return { idx: i, size: `${s.rows.length}x${s.rows[0]?.cells.length ?? 0}`, preview };
      });

    const unmatch = unmatched.length;
    console.log(`총${schemas.length} 매칭${matched.length} 미매칭${unmatch}`);
    results.push({ cdms, title, totalTables: schemas.length, matched, unmatched });
    ok++;
  } catch (e: any) {
    console.log(`ERR ${String(e?.message ?? e).slice(0, 50)}`);
    results.push({ cdms, title, totalTables: 0, matched: [], unmatched: [], error: String(e?.message) });
    fail++;
  }
}

// ─── 요약 출력 ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════');
console.log('유형별 총 매칭 수');
for (const [name, count] of Object.entries(typeCount)) {
  console.log(`  ${name.padEnd(20)} ${count}`);
}

console.log('\n미매칭 테이블이 있는 파일:');
for (const r of results) {
  if (r.unmatched.length === 0 || r.error) continue;
  console.log(`  [${r.cdms}] ${r.title}`);
  for (const u of r.unmatched) {
    console.log(`    tbl[${u.idx}] ${u.size.padEnd(7)} "${u.preview}"`);
  }
}

console.log('\n매칭 실패 파일:');
for (const r of results) {
  if (!r.error) continue;
  console.log(`  [${r.cdms}] ${r.error}`);
}

console.log(`\n✅ ${ok}개 처리 / ${fail}개 실패`);

// ─── JSON 저장 ───────────────────────────────────────────────────────────────

fs.writeFileSync(
  'D:/woo-work/hwp-pipe-output/collect-validation.json',
  JSON.stringify(results, null, 2),
);
console.log('→ D:/woo-work/hwp-pipe-output/collect-validation.json');
