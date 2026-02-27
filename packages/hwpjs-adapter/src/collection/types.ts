/**
 * 테이블 수집 레이어 타입 정의
 *
 * 역할 분리:
 *   어댑터(hwpjs-adapter) — HWP → TableSchema 변환 + 수집 조건 매칭
 *   table-manager         — 수집된 Table에서 패턴 기반 콘텐츠 파싱
 */

import type { TableSchema } from '../table-schema.js';
import type { Table } from '../../../table-manager/src/schema.js';

// ============================================================================
// 수집 패턴 (collect_pattern)
// ============================================================================

/**
 * 헤더 행(또는 임의의 행)에 특정 텍스트가 포함된 셀이 있는지 확인
 * row 생략 시 전체 행 스캔
 */
export interface HeaderContainsPattern {
  type: 'header_contains';
  text: string;
  row?: number;
}

/** 테이블 캡션에 특정 텍스트 포함 여부 */
export interface CaptionContainsPattern {
  type: 'caption_contains';
  text: string;
}

/** 특정 셀(row, col)의 값이 정규식에 일치하는지 확인 */
export interface CellMatchesPattern {
  type: 'cell_matches';
  row: number;
  col: number;
  /** 정규식 문자열 */
  pattern: string;
}

/** 최소 행/열 수 조건 */
export interface SizePattern {
  type: 'size';
  min_rows?: number;
  min_cols?: number;
}

/** 모든 하위 패턴을 동시에 만족해야 함 */
export interface AndPattern {
  type: 'and';
  patterns: CollectPattern[];
}

/** 하위 패턴 중 하나 이상을 만족하면 됨 */
export interface OrPattern {
  type: 'or';
  patterns: CollectPattern[];
}

export type CollectPattern =
  | HeaderContainsPattern
  | CaptionContainsPattern
  | CellMatchesPattern
  | SizePattern
  | AndPattern
  | OrPattern;

// ============================================================================
// 테이블 유형 정의 (TableTypeSchema)
// ============================================================================

/**
 * 수집 대상 테이블 유형 정의.
 * 유형마다 수집 패턴이 완전히 분리됨.
 */
export interface TableTypeSchema {
  /** 유형 이름 (e.g. "weekly_plan", "instructor_info") */
  name: string;
  description?: string;
  /** 이 유형의 테이블을 찾기 위한 수집 조건 */
  collect_pattern: CollectPattern;
}

// ============================================================================
// 매칭 정보 (어떤 조건으로 수집됐는지)
// ============================================================================

export interface MatchInfo {
  /** 최종 매칭을 결정한 패턴 타입 */
  pattern_type: string;
  /** 실제 매칭된 텍스트 (header_contains, caption_contains 시) */
  matched_text?: string;
  /** 매칭된 셀 위치 (header_contains, cell_matches 시) */
  location?: { row: number; col: number };
}

// ============================================================================
// 수집 결과 (CollectedTable)
// ============================================================================

/**
 * 수집된 테이블 단위.
 * 원본 TableSchema + 매칭 메타데이터 포함.
 */
export interface CollectedTable {
  /** 매칭된 유형 이름 */
  table_type: string;
  /** 어떤 조건으로 수집됐는지 */
  match_info: MatchInfo;
  /** HWP 내 테이블 인덱스 (0-based) */
  table_index: number;
  /** 원본 TableSchema 전체 */
  schema: TableSchema;
  /** table-manager Table로 변환 (지연 변환) */
  toTable(): Table;
}
