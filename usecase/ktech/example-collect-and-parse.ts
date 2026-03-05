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
import { extractNcsUnits, type NcsUnit } from './ncs-units.js';

// schemas는 위 1단계에서 추출한 TableSchema[]

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

// ── 2b. 능력단위 추출 ────────────────────────────────────────────────────────
//
// course_info 테이블(table[2])에서 능력단위 행을 파싱한다.
// 결과: [{ code: '1903050304_14v1', name: '전자부품하드웨어 사양서 분석', level: '4수준' }]
//
// 향후: weekly_plan 테이블의 능력단위요소 행과 조합하여
//       "1903050304_14v1.1 부품 기능 분석하기" 형태로 표현 예정.

function extractUnitsFromSchemas(schemas: any[]): NcsUnit[] {
  const collected = collectWithSpecs(schemas, ktechTableSpecs);

  const courseInfo = collected.find(c => c.table_type === 'course_info');
  if (!courseInfo) return [];

  return extractNcsUnits(courseInfo.schema);
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

export { collectFromSchemas, extractUnitsFromSchemas };
