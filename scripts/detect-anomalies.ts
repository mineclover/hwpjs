/**
 * Stage 3: TableSchema JSON → Anomaly Detection Report
 *
 * Usage:
 *   bun scripts/detect-anomalies.ts <schemas-dir> <schema-json> [output-dir]
 *
 * Example:
 *   bun scripts/detect-anomalies.ts pipeline/output/schemas \
 *       scripts/schemas/lecture-plan-v1.json \
 *       pipeline/output/anomalies
 *
 * 입력:  Stage 1 출력 (extract-schemas.ts) → schemas/*.json
 * 출력:
 *   <output>/anomalies.json    ← 파일별 ExtractionRecord 배열
 *   <output>/report.html       ← 시각화 리포트
 */

import * as fs from 'fs';
import * as path from 'path';
import type { TableSchema } from '../packages/hwpjs-adapter/src/table-schema';
import type {
  DocumentSchema,
  ExtractionRecord,
  AnomalyHit,
  Severity,
} from '../packages/hwpjs-adapter/src/anomaly/types';
import { extractAllFields } from '../packages/hwpjs-adapter/src/anomaly/extractor';
import { evaluateRules } from '../packages/hwpjs-adapter/src/anomaly/evaluator';

// ============================================================================
// Schema File Types (Stage 1 output)
// ============================================================================

interface StageOneFile {
  file: string;
  extractedAt: string;
  schemas: TableSchema[];
}

// ============================================================================
// Process single file
// ============================================================================

function processFile(stageOne: StageOneFile, docSchema: DocumentSchema): ExtractionRecord {
  const fields = extractAllFields(docSchema.fields, stageOne.schemas);
  const anomalies = evaluateRules(docSchema.anomaly_rules, fields);

  return {
    source_file: stageOne.file,
    schema_id: docSchema.schema_id,
    extracted_at: new Date().toISOString(),
    fields,
    anomalies,
  };
}

// ============================================================================
// HTML Report
// ============================================================================

const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'ERROR', 'WARN', 'INFO'];

const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: '#721c24',
  ERROR: '#856404',
  WARN: '#856404',
  INFO: '#0c5460',
};

const SEVERITY_BG: Record<Severity, string> = {
  CRITICAL: '#f8d7da',
  ERROR: '#fff3cd',
  WARN: '#fff8e1',
  INFO: '#d1ecf1',
};

function severityBadge(s: Severity): string {
  return `<span style="background:${SEVERITY_BG[s]};color:${SEVERITY_COLOR[s]};padding:1px 6px;border-radius:3px;font-size:11px;font-weight:bold">${s}</span>`;
}

function renderHitRow(hit: AnomalyHit): string {
  const loc = hit.location
    ? `T${(hit.location.table_index ?? 0) + 1}${hit.location.row_index !== undefined ? ` R${hit.location.row_index + 1}` : ''}`
    : '';
  return `<tr>
    <td>${severityBadge(hit.severity)}</td>
    <td style="font-family:monospace;font-size:11px">${hit.rule_id}</td>
    <td>${hit.message}${hit.detail ? `<br><span style="font-size:11px;color:#666">${hit.detail}</span>` : ''}</td>
    <td style="font-size:11px;color:#888">${loc}</td>
  </tr>`;
}

function buildReport(records: ExtractionRecord[], docSchema: DocumentSchema): string {
  const totalFiles = records.length;
  const allHits = records.flatMap((r) => r.anomalies);

  // severity 별 집계
  const bySeverity = Object.fromEntries(
    SEVERITY_ORDER.map((s) => [s, allHits.filter((h) => h.severity === s).length])
  ) as Record<Severity, number>;

  // rule_id 별 집계 (상위 10)
  const ruleCount: Record<string, number> = {};
  for (const h of allHits) ruleCount[h.rule_id] = (ruleCount[h.rule_id] ?? 0) + 1;
  const topRules = Object.entries(ruleCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 이상이 있는 파일 수
  const filesWithAnomaly = records.filter((r) => r.anomalies.length > 0).length;

  const summaryCards = SEVERITY_ORDER.map((s) => {
    const cnt = bySeverity[s];
    if (!cnt) return '';
    return `<div style="background:${SEVERITY_BG[s]};color:${SEVERITY_COLOR[s]};padding:10px 18px;border-radius:6px;text-align:center">
      <div style="font-size:22px;font-weight:bold">${cnt}</div>
      <div style="font-size:12px">${s}</div>
    </div>`;
  }).join('');

  const topRuleRows = topRules
    .map(
      ([rid, cnt]) =>
        `<tr><td style="font-family:monospace;font-size:12px">${rid}</td><td style="text-align:right">${cnt}</td></tr>`
    )
    .join('');

  const fileRows = records
    .map((r) => {
      const byS = Object.fromEntries(
        SEVERITY_ORDER.map((s) => [s, r.anomalies.filter((h) => h.severity === s).length])
      ) as Record<Severity, number>;

      const badges = SEVERITY_ORDER.filter((s) => byS[s] > 0)
        .map(
          (s) =>
            `<span style="background:${SEVERITY_BG[s]};color:${SEVERITY_COLOR[s]};padding:1px 5px;border-radius:3px;font-size:11px">${byS[s]} ${s}</span>`
        )
        .join(' ');

      const hitDetails =
        r.anomalies.length > 0
          ? `<table style="width:100%;margin-top:6px;border-collapse:collapse">
           <thead><tr style="background:#f1f3f5">
             <th style="padding:4px 8px;text-align:left;font-size:11px;width:80px">Severity</th>
             <th style="padding:4px 8px;text-align:left;font-size:11px;width:220px">Rule ID</th>
             <th style="padding:4px 8px;text-align:left;font-size:11px">Message</th>
             <th style="padding:4px 8px;text-align:left;font-size:11px;width:60px">Location</th>
           </tr></thead>
           <tbody>${r.anomalies.map(renderHitRow).join('')}</tbody>
         </table>`
          : '<div style="color:#aaa;font-size:12px;margin-top:4px">이상 없음</div>';

      const rowBg = r.anomalies.some((h) => h.severity === 'CRITICAL' || h.severity === 'ERROR')
        ? '#fff8f8'
        : r.anomalies.length > 0
          ? '#fffdf0'
          : '#f8fff8';

      return `<details style="margin-bottom:6px;border:1px solid #dee2e6;border-radius:6px;background:${rowBg}">
      <summary style="padding:8px 14px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center">
        <span style="font-weight:bold;font-size:13px">${r.source_file}</span>
        <span style="display:flex;gap:4px;align-items:center">${badges || '<span style="color:#aaa;font-size:12px">✓ 정상</span>'}</span>
      </summary>
      <div style="padding:6px 14px 12px">${hitDetails}</div>
    </details>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>Anomaly Report — ${docSchema.schema_id}</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 13px; margin: 24px; background: #f5f5f5; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #888; font-size: 12px; margin-bottom: 20px; }
  .cards { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat-card { background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 1px 3px rgba(0,0,0,.1); text-align: center; }
  .stat-card .num { font-size: 28px; font-weight: bold; }
  .stat-card .lbl { font-size: 12px; color: #888; }
  section { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  section h2 { font-size: 14px; margin: 0 0 12px; }
  table.top-rules { border-collapse: collapse; width: 100%; }
  table.top-rules td { border: 1px solid #dee2e6; padding: 5px 10px; }
  table.top-rules tr:nth-child(even) td { background: #f8f9fa; }
  details > summary::-webkit-details-marker { display: none; }
</style>
</head>
<body>
<h1>Anomaly Report</h1>
<div class="subtitle">${docSchema.schema_id} · ${docSchema.description} · 생성: ${new Date().toLocaleString('ko-KR')}</div>

<div class="cards">
  <div class="stat-card">
    <div class="num">${totalFiles}</div>
    <div class="lbl">검사 파일</div>
  </div>
  <div class="stat-card">
    <div class="num" style="color:${filesWithAnomaly ? '#c62828' : '#2e7d32'}">${filesWithAnomaly}</div>
    <div class="lbl">이상 파일</div>
  </div>
  <div class="stat-card">
    <div class="num">${allHits.length}</div>
    <div class="lbl">총 이상 건수</div>
  </div>
  ${summaryCards}
</div>

${
  topRules.length > 0
    ? `
<section>
  <h2>자주 발생한 규칙 TOP ${topRules.length}</h2>
  <table class="top-rules">
    <thead><tr style="background:#495057;color:#fff"><th style="padding:6px 10px;text-align:left">Rule ID</th><th style="padding:6px 10px;text-align:right;width:60px">건수</th></tr></thead>
    <tbody>${topRuleRows}</tbody>
  </table>
</section>`
    : ''
}

<section>
  <h2>파일별 결과</h2>
  ${fileRows}
</section>
</body>
</html>`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      'Usage: bun scripts/detect-anomalies.ts <schemas-dir> <schema-json> [output-dir]'
    );
    process.exit(1);
  }

  const schemasDir = args[0];
  const schemaFile = args[1];
  const outputDir = args[2] || path.join(schemasDir, '..', 'anomalies');

  fs.mkdirSync(outputDir, { recursive: true });

  // 스키마 로드
  const docSchema: DocumentSchema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
  console.log(`Schema: ${docSchema.schema_id} (${docSchema.description})`);
  console.log(`Rules:  ${docSchema.anomaly_rules.length}개`);

  // Stage 1 JSON 파일 목록
  const jsonFiles = fs
    .readdirSync(schemasDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(schemasDir, f));

  console.log(`Files:  ${jsonFiles.length}개 → ${outputDir}\n`);

  const records: ExtractionRecord[] = [];

  for (const jsonPath of jsonFiles) {
    const stageOne: StageOneFile = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const record = processFile(stageOne, docSchema);
    records.push(record);

    const counts = Object.fromEntries(
      SEVERITY_ORDER.map((s) => [s, record.anomalies.filter((h) => h.severity === s).length])
    );
    const summary =
      SEVERITY_ORDER.filter((s) => counts[s] > 0)
        .map((s) => `${counts[s]} ${s}`)
        .join(', ') || '정상';

    console.log(`  ${stageOne.file}: ${summary}`);
  }

  // 출력
  const outJson = path.join(outputDir, 'anomalies.json');
  const outHtml = path.join(outputDir, 'report.html');

  fs.writeFileSync(outJson, JSON.stringify(records, null, 2), 'utf-8');
  fs.writeFileSync(outHtml, buildReport(records, docSchema), 'utf-8');

  const totalHits = records.flatMap((r) => r.anomalies).length;
  const filesWithAnomaly = records.filter((r) => r.anomalies.length > 0).length;

  console.log(`\nDone!`);
  console.log(`  JSON:   ${outJson}`);
  console.log(`  Report: ${outHtml}`);
  console.log(`  결과: ${jsonFiles.length}개 파일, ${filesWithAnomaly}개 이상, ${totalHits}건`);
}

main();
