/**
 * ktech 강의계획서 테이블 유형 스펙 정의
 *
 * 3-레이어 아키텍처:
 *   1. 수집 조건 정의  — TableTypeDef.collect_pattern (hwpjs-adapter)
 *   2. 테이블 수집     — collectWithSpecs() (hwpjs-adapter)
 *   3. 콘텐츠 추출     — TableManager + TableTransformEngine (table-manager)
 *
 * 이 파일은 수집 조건(collect_pattern)과 변환 규칙(transform_rule)을 한 곳에 정의한다.
 * transform_rule은 table-manager가 설치된 환경에서 사용한다.
 *
 * ── 발견된 파일 유형별 테이블 구조 ─────────────────────────────────────────
 *
 * 표준형 (11개 테이블):
 *   - 강사 정보: 11×5 (성명/소속/연락처/이메일 등)
 *   - 주차별 계획: 41~51×4~5 ("주요내용" 헤더, 5행/주차 KOR 포맷)
 *
 * A형 (12개 테이블 — e.g. 202500331, 202500338):
 *   - 강사 정보: 1×1 (단일 셀에 정보 압축 수록)
 *   - 주차별 계획: 16×3 ("주요내용" 헤더, 3열 포맷)
 *
 * B형 (12개 테이블 — e.g. 202500346, 202500347, 202500339):
 *   - 주차별 계획: 41×2 ("주요내용" 헤더, 2열 포맷)
 *
 * C형 (12개 테이블 — e.g. 202500348, 202500349, 202500350):
 *   - 주차별 계획: 91×2 ("주요내용" 헤더, 2열 포맷, 강의 수 多)
 *
 * 분할형 (17개 테이블 — 202502754):
 *   - 주차별 계획이 4×16×2 + 2×11×2 = 6개 하위 테이블로 분할 수록
 */

import type { TableTypeSpec } from '@ohah/hwpjs-adapter/collection';

// table-manager가 설치된 경우 transform_rule에 타입 안전성 부여
// import type { TransformRule } from 'table-manager';
// type Spec = TableTypeSpec<TransformRule>;
type Spec = TableTypeSpec;

// ============================================================================
// 주차별 수업 계획 테이블
// ============================================================================

/**
 * 주차별 수업 계획 (1행/주차 포맷 — "구성내용" 헤더)
 *
 * 형식: | 주차 | 구성내용 | 시간 | ... |
 */
const weeklyPlanSpec: Spec = {
  def: {
    name: 'weekly_plan',
    description: '주차별 수업 구성 계획 (1행/주차)',
    collect_pattern: { type: 'header_contains', text: '구성내용' },
  },
  transform_rule: {
    id: 'weekly_plan',
    type: 'collection',
    layout: {
      header: { type: 'row', row: 0 },
      data: { type: 'range', start: { row: 1, col: 0 }, end: { row: -1, col: -1 } },
    },
    options: { skipEmptyRows: true, trimValues: true },
    fields: [
      { name: 'week', header: '주차' },
      { name: 'contents', header: '구성내용' },
      { name: 'hours', header: '시간' },
      { name: 'method', header: '수업방법' },
    ],
  },
};

/**
 * 주차별 수업 계획 (KOR 포맷 — "주요내용" 헤더)
 *
 * 표준형: 5행/주차, ~41행×4열
 * A형:    16행×3열 (하위 포맷, 3열)
 * B형:    41행×2열 (하위 포맷, 2열)
 * C형:    91행×2열 (강의 수 多)
 * 분할형: 16행×2열 또는 11행×2열 하위 테이블이 여러 개 (202502754)
 *
 * min_rows:10 조건으로 소형 비주차 테이블과 구분.
 * 분할 하위 테이블(11행~)도 개별적으로 수집된다.
 */
const weeklyPlanKorSpec: Spec = {
  def: {
    name: 'weekly_plan_kor',
    description: '주차별 수업 구성 계획 (KOR 포맷, "주요내용" 헤더)',
    collect_pattern: {
      type: 'and',
      patterns: [
        { type: 'header_contains', text: '주요내용' },
        { type: 'size', min_rows: 10 },
      ],
    },
  },
  transform_rule: {
    id: 'weekly_plan_kor',
    type: 'collection',
    layout: {
      header: { type: 'row', row: 0 },
      data: { type: 'range', start: { row: 1, col: 0 }, end: { row: -1, col: -1 } },
    },
    options: { skipEmptyRows: false, trimValues: true },
  },
};

// ============================================================================
// 강사 정보 테이블
// ============================================================================

/**
 * 강사 기본 정보 싱글톤 테이블
 *
 * ktech HWP 파일은 강사 정보 테이블의 셀 텍스트가 raw 셀이 아닌
 * ctrl_header.paragraphs[]에만 저장돼 있어 header_contains 패턴이 동작하지 않는다.
 * → 셀 내용 없이 크기(size)만으로 탐지한다.
 *
 * 표준형: Nx5 (10~44행) — | 성명 | 홍길동 | 소속 | ... |
 * 변형:   Nx3 (10~30행) — 일부 파일에서 3열 포맷 사용
 *                         (46x3는 주차 계획 테이블이므로 max_rows:30으로 제외)
 *
 * 주의: 일부 파일의 1x1 "내용전문가 선정 기준" 테이블은 별도 유형 (expert_criteria)
 */
const instructorInfoSpec: Spec = {
  def: {
    name: 'instructor_info',
    description: '강사 기본 정보 (이름, 소속, 연락처 등)',
    collect_pattern: {
      type: 'or',
      patterns: [
        // 표준형: Nx5
        { type: 'size', min_cols: 5, max_cols: 5, min_rows: 5 },
        // 변형: Nx3 (10행 이상) — weekly_plan_kor보다 뒤에 평가되므로
        // 이미 weekly_plan_kor에 매칭된 Nx3 테이블은 중복 수집되지 않음
        { type: 'size', min_cols: 3, max_cols: 3, min_rows: 10 },
      ],
    },
  },
  transform_rule: {
    id: 'instructor_info',
    type: 'singleton',
    layout: {
      // 헤더: 홀수 열 (0, 2, 4, ...) — "성명", "소속" 등
      header: { type: 'pattern', match: { isHeader: true } },
      // 데이터: 짝수 열 (1, 3, 5, ...) — 실제 값
      data: { type: 'pattern', match: { isHeader: false } },
    },
    options: { trimValues: true },
    fields: [
      { name: 'name', header: '성명' },
      { name: 'affiliation', header: '소속' },
      { name: 'contact', header: '연락처' },
      { name: 'email', header: '이메일' },
    ],
  },
};

// ============================================================================
// 과정 정보 테이블 (NCS 수행정보 + 능력단위 포함)
// ============================================================================

/**
 * 과정 정보 테이블 — NCS 수행정보, 분류체계, 능력단위 포함
 *
 * 형식 (table[2] 패턴):
 *   row 0: 과정명(국문) | ...
 *   row 1: 과정명(영문) | ...
 *   row 2: NCS 수행정보 | 적용 여부 | ...
 *   row 3~7: 분류 코드 (대/중/소/세분류)
 *   row 8~: 능력단위 헤더 + 데이터 (분류번호 | 능력단위명 | NCS 수준)
 *
 * 능력단위 행 추출: extractNcsUnits() (usecase/ktech/ncs-units.ts)
 */
const courseInfoSpec: Spec = {
  def: {
    name: 'course_info',
    description: '과정 정보 (NCS 수행정보, 능력단위 포함)',
    collect_pattern: {
      type: 'and',
      patterns: [
        { type: 'header_contains', text: '분류번호' },
        { type: 'header_contains', text: '능력단위명' },
      ],
    },
  },
};

// ============================================================================
// 내용전문가 선정 기준 테이블 (A형 등 일부 파일)
// ============================================================================

/**
 * 내용전문가 선정 기준 안내 테이블
 *
 * 형식: 1×1 단일 셀 — "< 내용전문가 선정 기준 > 아래의 ①~⑥ 요건 중 ..."
 * 11개 파일에서 발견. A형/B형/C형 파일에 포함되며 강사 정보 테이블 앞에 위치.
 *
 * cell_matches 패턴 사용: 1x1이면서 "내용전문가" 텍스트 포함
 */
const expertCriteriaSpec: Spec = {
  def: {
    name: 'expert_criteria',
    description: '내용전문가 선정 기준 안내 (1×1 단일 셀)',
    collect_pattern: {
      type: 'and',
      patterns: [
        { type: 'size', max_rows: 1, max_cols: 1 },
        { type: 'cell_matches', row: 0, col: 0, pattern: '내용전문가' },
      ],
    },
  },
};

// ============================================================================
// 공개 스펙 배열
// ============================================================================

export const ktechTableSpecs: Spec[] = [
  courseInfoSpec,
  weeklyPlanSpec,
  weeklyPlanKorSpec,
  instructorInfoSpec,
  expertCriteriaSpec,
];

export {
  courseInfoSpec,
  weeklyPlanSpec,
  weeklyPlanKorSpec,
  instructorInfoSpec,
  expertCriteriaSpec,
};
