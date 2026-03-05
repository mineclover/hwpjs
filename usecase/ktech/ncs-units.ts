/**
 * 능력단위 추출 유틸리티
 *
 * course_info 수집 결과 (table[2])에서 능력단위 행들을 파싱한다.
 *
 * 테이블 내 능력단위 섹션 형식:
 *   [헤더행] "능력단위\n※ …" | "분류번호" | "능력단위명" | "NCS 수준"
 *   [데이터] "1903050304_14v1" | "전자부품하드웨어 사양서 분석" | "4수준"
 *   [데이터] ...  (여러 능력단위 가능)
 */

import type { TableSchema } from '@ohah/hwpjs/table-schema';

export interface NcsUnit {
  /** NCS 능력단위 분류번호 (e.g. "1903050304_14v1") */
  code: string;
  /** 능력단위명 (e.g. "전자부품하드웨어 사양서 분석") */
  name: string;
  /** NCS 수준 (e.g. "4수준") */
  level: string;
}

/**
 * course_info 테이블 스키마에서 능력단위 행들을 추출한다.
 *
 * @param schema - collectWithSpecs()로 수집된 course_info 테이블의 .schema
 * @returns 유효한 능력단위 배열 (분류번호가 없는 빈 행 제외)
 *
 * @example
 * ```typescript
 * const collected = collectWithSpecs(schemas, ktechTableSpecs);
 * const courseInfo = collected.find(c => c.table_type === 'course_info');
 * if (courseInfo) {
 *   const units = extractNcsUnits(courseInfo.schema);
 *   // [{ code: '1903050304_14v1', name: '전자부품하드웨어 사양서 분석', level: '4수준' }]
 * }
 * ```
 */
export function extractNcsUnits(schema: TableSchema): NcsUnit[] {
  const rows = schema.rows;

  // "능력단위"로 시작하는 헤더 행 위치 탐색
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cell0 = String(rows[i].cells[0]?.value ?? '').trim();
    if (cell0.startsWith('능력단위')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const units: NcsUnit[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i].cells;
    const code = String(cells[0]?.value ?? '').trim();
    const name = String(cells[1]?.value ?? '').trim();
    const level = String(cells[2]?.value ?? '').trim();

    // 분류번호가 없는 빈 행 건너뜀
    if (!code) continue;

    units.push({ code, name, level });
  }

  return units;
}

/**
 * 능력단위를 "분류번호.서브코드 이름" 형식 문자열로 포맷한다.
 *
 * 분류번호와 능력단위요소 코드(서브코드)를 조합하여 표현할 때 사용.
 *
 * @example
 * formatNcsUnit({ code: '1903050304_14v1', name: '전자부품하드웨어 사양서 분석', level: '4수준' })
 * // → "1903050304_14v1 전자부품하드웨어 사양서 분석 (4수준)"
 */
export function formatNcsUnit(unit: NcsUnit): string {
  return `${unit.code} ${unit.name} (${unit.level})`;
}
