/**
 * mapped/*.extract.json → 메타데이터 요약 CSV
 *
 * 출력 컬럼:
 *   cdms_code, title, source_hwp, extracted_at,
 *   text_count, table_count, table_sizes
 */
import type { ExtractResult } from '../packages/hwpjs-adapter/src/extract/index.js';
import * as fs from 'fs';
import * as path from 'path';

const mappedDir = 'D:/woo-work/hwp-pipe-output/mapped';
const outCsv = 'D:/woo-work/hwp-pipe-output/metadata.csv';

function csvCell(v: string): string {
  const s = String(v ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

const files = fs
  .readdirSync(mappedDir)
  .filter((f) => f.endsWith('.extract.json'))
  .sort();

const header = [
  'cdms_code',
  'title',
  'source_hwp',
  'extracted_at',
  'text_count',
  'table_count',
  'table_sizes',
];

const rows: string[][] = [];

for (const fname of files) {
  const result: ExtractResult = JSON.parse(fs.readFileSync(path.join(mappedDir, fname), 'utf-8'));
  const meta = result.meta as any;

  const textCount = result.records.filter((r) => r.kind === 'text').length;
  const tableCount = result.records.filter((r) => r.kind === 'table').length;
  const tableSizes = result.records
    .filter((r) => r.kind === 'table')
    .map((r) => `${r.table!.row_count}x${r.table!.col_count}`)
    .join(' ');

  rows.push([
    meta.cdms_code ?? '',
    meta.title ?? '',
    path.basename(meta.source_hwp ?? ''),
    meta.extracted_at ?? '',
    String(textCount),
    String(tableCount),
    tableSizes,
  ]);
}

const csv = [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');

fs.writeFileSync(outCsv, '﻿' + csv, 'utf-8'); // BOM for Excel

console.log(`✅ ${rows.length}개 → ${outCsv}`);
