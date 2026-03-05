/**
 * ktech 강의계획서 — 수집 + 콘텐츠 추출 예제
 *
 * 타겟 파일: 036 (외국인노동자 노동법), 074 (기초전자회로)
 *
 * 3-레이어 파이프라인:
 *   HWP 파일    → TableSchema[]   (hwpjs)
 *   TableSchema[] → CollectedTable[] (hwpjs-adapter)
 *   CollectedTable → CourseInfo      (ncs-units.ts)
 */

import * as path from 'path';
import { collectWithSpecs } from '@ohah/hwpjs-adapter/collection';
import { ktechTableSpecs } from './ktech-table-specs.js';
import {
  loadCourseInfoJson,
  extractCourseInfo,
  type CourseInfo,
} from './ncs-units.js';

// ── A. JSON 직접 로드 (CSV 필드 포함, 권장) ───────────────────────────────
//
// 기존 파이프라인 결과(competency-units.json)에 이미 CSV 필드가 포함되어 있으므로
// 타겟 파일 수가 적을 때는 이 방법이 가장 빠르다.

export function loadTargetCourses(jsonPath: string): CourseInfo[] {
  // 현재 타겟: 036, 074
  return loadCourseInfoJson(jsonPath, [36, 74]);
}

// ── B. HWP 실시간 추출 (CSV 필드 없음) ────────────────────────────────────
//
// stage1 schemas JSON에서 로드하는 경우.
// publicContentEval / category / cdmsCode는 별도로 병합 필요.

export function extractFromSchemas(schemas: any[], fileName: string): CourseInfo {
  const collected = collectWithSpecs(schemas, ktechTableSpecs);
  const courseInfoTable = collected.find(c => c.table_type === 'course_info');
  if (!courseInfoTable) throw new Error(`course_info 테이블 없음: ${fileName}`);
  return extractCourseInfo(courseInfoTable.schema, fileName);
}

// ── 사용 예 ───────────────────────────────────────────────────────────────
//
// import { loadTargetCourses } from './example-collect-and-parse.js';
//
// const courses = loadTargetCourses('pipeline/html/competency-units.json');
// for (const c of courses) {
//   console.log(c.fileNumber, c.courseName);
//   console.log('  능력단위:', c.competencyUnits.map(u => `${u.code} ${u.name}`));
//   console.log('  분류:', c.classification.major.name, '>', c.classification.detail.name);
//   console.log('  CDMS:', c.cdmsCode, '/ 공공평가:', c.publicContentEval);
// }

// ── 3. 콘텐츠 추출 (table-manager) ────────────────────────────────────────
//
// import { TableManager, TableTransformEngine } from 'table-manager';
//
// function extractCollected(schemas: any[]) {
//   const collected = collectWithSpecs(schemas, ktechTableSpecs);
//   const engine = new TableTransformEngine();
//   for (const c of collected) {
//     if (!c.transform_rule) continue;
//     const result = engine.execute(new TableManager(c.toTable()), { rules: [c.transform_rule] });
//     if (result.success) console.log(`[${c.table_type}]`, result.data[c.transform_rule.id]);
//   }
// }
