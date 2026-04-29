/**
 * 능력단위 / 과정 정보 추출 유틸리티
 *
 * 두 가지 데이터 소스를 지원한다:
 *   1. competency-units.json  — 기존 파이프라인 출력, CSV 필드(publicContentEval 등) 포함
 *   2. course_info TableSchema — HWP에서 실시간 추출 (CSV 필드 제외)
 *
 * 타겟 파일이 적을 때는 JSON 로더를 우선 사용한다.
 */

import * as fs from 'fs';
import type { TableSchema } from '@ohah/hwpjs-adapter/table-schema';

// ============================================================================
// 타입 정의 (competency-units.json 구조와 동일)
// ============================================================================

export interface NcsUnit {
  /** NCS 능력단위 분류번호 (e.g. "1903050304_14v1") */
  code: string;
  /** 능력단위명 (e.g. "전자부품하드웨어 사양서 분석") */
  name: string;
  /** NCS 수준 (e.g. "4수준") */
  level: string;
}

export interface NcsClassification {
  major:  { code: string; name: string };
  middle: { code: string; name: string };
  minor:  { code: string; name: string };
  detail: { code: string; name: string };
}

export interface CheckboxPattern {
  pattern: string;  // e.g. "이론", "이론,실습"
  count: number;
}

export interface CheckboxCounts {
  patterns: CheckboxPattern[];
  topPattern: string;
  totalLessons: number;
}

/**
 * 과정 정보 전체 구조 (competency-units.json 필드와 동일)
 */
export interface CourseInfo {
  fileName: string;
  fileNumber: number | null;
  courseName: string;
  courseNameEn: string;
  ncsApplied: boolean;
  classification: NcsClassification;
  competencyUnits: NcsUnit[];
  maxNcsLevel: number | null;
  /** 공공 콘텐츠 평가 (Y/N) — CSV 소스 또는 JSON 로드 시에만 유효 */
  publicContentEval: string;
  /** 구분 (e.g. "재개발", "직기초 외") — CSV 소스 또는 JSON 로드 시에만 유효 */
  category: string;
  /** CDMS 과목코드 — CSV 소스 또는 JSON 로드 시에만 유효 */
  cdmsCode: string;
  /** 이론/실습/사례 체크박스 패턴 — weekly_plan 테이블 분석 결과 */
  checkboxCounts: CheckboxCounts;
}

// ============================================================================
// JSON 로더 (competency-units.json 직접 사용)
// ============================================================================

/**
 * 기존 competency-units.json을 로드한다.
 *
 * @param jsonPath  - competency-units.json 경로
 * @param fileNumbers - 필터링할 파일 순번 (생략 시 전체 반환)
 *
 * @example
 * ```typescript
 * // 036, 074번 파일만 로드
 * const courses = loadCourseInfoJson('pipeline/html/competency-units.json', [36, 74]);
 * ```
 */
export function loadCourseInfoJson(
  jsonPath: string,
  fileNumbers?: number[],
): CourseInfo[] {
  const raw: CourseInfo[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  if (!fileNumbers || fileNumbers.length === 0) return raw;
  return raw.filter(c => c.fileNumber !== null && fileNumbers.includes(c.fileNumber));
}

// ============================================================================
// HWP 실시간 추출 (TableSchema → CourseInfo, CSV 필드 제외)
// ============================================================================

function getCellStr(row: TableSchema['rows'][number], col: number): string {
  return String(row?.cells[col]?.value ?? '').trim();
}

function parseNcsLevel(levelStr: string): number | null {
  const m = levelStr.trim().match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function isCompetencyCode(value: string): boolean {
  return /^\d+_\d+v\d+/.test(value.trim());
}

/**
 * course_info 테이블(table[2])에서 과정 정보를 추출한다.
 * CSV 필드(publicContentEval, category, cdmsCode)와 checkboxCounts는
 * 기본값 빈 문자열/빈 배열로 채워진다.
 *
 * CSV 필드가 필요하면 loadCourseInfoJson()을 사용하거나
 * 반환값에 직접 병합하라.
 *
 * @example
 * ```typescript
 * const collected = collectWithSpecs(schemas, ktechTableSpecs);
 * const courseInfo = collected.find(c => c.table_type === 'course_info');
 * if (courseInfo) {
 *   const info = extractCourseInfo(courseInfo.schema);
 * }
 * ```
 */
export function extractCourseInfo(
  schema: TableSchema,
  fileName = '',
): Omit<CourseInfo, 'publicContentEval' | 'category' | 'cdmsCode' | 'checkboxCounts'> & {
  publicContentEval: '';
  category: '';
  cdmsCode: '';
  checkboxCounts: CheckboxCounts;
} {
  const rows = schema.rows;

  const result: CourseInfo = {
    fileName,
    fileNumber: fileName ? (parseInt(fileName.match(/^(\d+)/)?.[1] ?? '', 10) || null) : null,
    courseName: '',
    courseNameEn: '',
    ncsApplied: false,
    classification: {
      major:  { code: '', name: '' },
      middle: { code: '', name: '' },
      minor:  { code: '', name: '' },
      detail: { code: '', name: '' },
    },
    competencyUnits: [],
    maxNcsLevel: null,
    publicContentEval: '',
    category: '',
    cdmsCode: '',
    checkboxCounts: { patterns: [], topPattern: '', totalLessons: 0 },
  };

  const labelMap: Record<string, keyof NcsClassification> = {
    '대분류': 'major', '중분류': 'middle', '소분류': 'minor', '세분류': 'detail',
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cell0 = getCellStr(row, 0);

    if (cell0 === '과정명(국문)') {
      result.courseName = getCellStr(row, 1);
    } else if (cell0 === '과정명(영문)') {
      result.courseNameEn = getCellStr(row, 1);
    } else if (cell0 === 'NCS 수행정보' || cell0.startsWith('NCS 수행정보')) {
      const appliedCell = getCellStr(row, 2);
      result.ncsApplied = appliedCell.includes('NCS 적용') && !appliedCell.includes('▢');
    } else if (labelMap[cell0]) {
      const key = labelMap[cell0];
      result.classification[key] = { code: getCellStr(row, 1), name: getCellStr(row, 2) };
    } else if (cell0.startsWith('능력단위')) {
      for (let j = i + 1; j < rows.length; j++) {
        const code = getCellStr(rows[j], 0);
        if (isCompetencyCode(code)) {
          result.competencyUnits.push({
            code,
            name: getCellStr(rows[j], 1),
            level: getCellStr(rows[j], 2),
          });
        } else {
          break;
        }
      }
    }
  }

  // maxNcsLevel 유도
  let maxLevel: number | null = null;
  for (const u of result.competencyUnits) {
    const lv = parseNcsLevel(u.level);
    if (lv !== null && (maxLevel === null || lv > maxLevel)) maxLevel = lv;
  }
  result.maxNcsLevel = maxLevel;

  return result as any;
}

// ============================================================================
// 편의 함수
// ============================================================================

/**
 * NcsUnit 배열만 빠르게 추출할 때 사용 (course_info schema 직접 전달)
 */
export function extractNcsUnits(schema: TableSchema): NcsUnit[] {
  return extractCourseInfo(schema).competencyUnits;
}
