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
 * 주차별 수업 계획 (5행/주차 KOR 포맷 — "주요내용" 헤더)
 *
 * 형식: 회차 | 학습목표 / 학습내용 / 능력단위요소 / 이론·실습·사례 (5행 반복)
 */
const weeklyPlanKorSpec: Spec = {
  def: {
    name: 'weekly_plan_kor',
    description: '주차별 수업 구성 계획 (5행/주차, KOR 포맷)',
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
 * 형식: | 성명 | 홍길동 | 소속 | 한국기술교육대학교 | ...
 */
const instructorInfoSpec: Spec = {
  def: {
    name: 'instructor_info',
    description: '강사 기본 정보 (이름, 소속, 연락처 등)',
    collect_pattern: {
      type: 'or',
      patterns: [
        { type: 'header_contains', text: '성명', row: 0 },
        { type: 'header_contains', text: '강사명', row: 0 },
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
// 공개 스펙 배열
// ============================================================================

export const ktechTableSpecs: Spec[] = [
  weeklyPlanSpec,
  weeklyPlanKorSpec,
  instructorInfoSpec,
];

export { weeklyPlanSpec, weeklyPlanKorSpec, instructorInfoSpec };
