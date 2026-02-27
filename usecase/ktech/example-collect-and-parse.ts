/**
 * ktech 강의계획서 — 수집 + 콘텐츠 추출 예제
 *
 * 3-레이어 파이프라인:
 *   HWP 파일    → TableSchema[]   (hwpjs)
 *   TableSchema[] → CollectedTable[] (hwpjs-adapter)
 *   CollectedTable → TransformResult  (table-manager)
 */

// ── 1. hwpjs로 HWP 파일 파싱 ───────────────────────────────────────────────
// import { readFileSync } from 'fs';
// import { toJson, toHtml } from '@ohah/hwpjs';
// import { extractAllTableSchemas, transformHwpTablesWithSchema } from '@ohah/hwpjs/table-schema';
// import type { ImageMap } from '@ohah/hwpjs/table-schema';
//
// const buffer = readFileSync('path/to/file.hwp');
// const html = toHtml(buffer, { includeVersion: false, includePageInfo: false });
// const imageMap: ImageMap = new Map();
// html.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g)?.forEach((url, i) => {
//   const format = url.match(/data:image\/([^;]+)/)?.[1] ?? 'unknown';
//   imageMap.set(i + 1, { dataUrl: url, format });
// });
// const json = JSON.parse(toJson(buffer));
// const schemas = extractAllTableSchemas(
//   transformHwpTablesWithSchema(json.body_text, { imageMap }),
// );

// ── 2. 테이블 수집 (hwpjs-adapter) ────────────────────────────────────────
import { collectWithSpecs } from '@ohah/hwpjs-adapter/collection';
import { ktechTableSpecs } from './ktech-table-specs.js';

// schemas는 위 1단계에서 추출한 TableSchema[]
// 예시: 파이프라인에서 이미 만들어진 JSON을 로드하는 경우
// import schemas from '../../pipeline/stage1/schemas/001...json';

function collectFromSchemas(schemas: any[]) {
  const collected = collectWithSpecs(schemas, ktechTableSpecs);

  console.log(`수집된 테이블: ${collected.length}개`);
  for (const c of collected) {
    console.log(`  [${c.table_index}] ${c.table_type} — 매칭: ${c.match_info.pattern_type}`);
    if (c.match_info.matched_text) {
      console.log(`        텍스트: "${c.match_info.matched_text}"`);
    }
  }

  return collected;
}

// ── 3. 콘텐츠 추출 (table-manager) ────────────────────────────────────────
//
// table-manager가 설치된 환경에서:
//
// import { TableManager, TableTransformEngine } from 'table-manager';
//
// function extractCollected(collected: ReturnType<typeof collectFromSchemas>) {
//   const engine = new TableTransformEngine();
//
//   for (const c of collected) {
//     if (!c.transform_rule) continue;
//
//     const table = c.toTable();               // TableSchema → Table
//     const manager = new TableManager(table);  // Table → TableManager
//     const result = engine.execute(manager, { rules: [c.transform_rule] });
//
//     if (result.success) {
//       const data = result.data[c.transform_rule.id];
//       console.log(`[${c.table_type}] 추출 완료:`, data);
//     } else {
//       console.warn(`[${c.table_type}] 추출 오류:`, result.errors);
//     }
//   }
// }

export { collectFromSchemas };
