/**
 * Anomaly Detection Framework — Type Definitions
 *
 * 3-layer architecture:
 *   DocumentSchema  → 수집 대상 정의 (무엇을, 어떻게 찾을지, 어떤 규칙 위반 시 이상인지)
 *   ExtractionRecord → 수집 결과
 *   AnomalyHit      → 규칙 위반 인스턴스
 */

// ============================================================================
// Primitives
// ============================================================================

export type Severity = 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO';

/** 비교 연산자 */
export type CompareOp =
  | 'eq'      // ==
  | 'neq'     // !=
  | 'lt'      // <
  | 'lte'     // <=
  | 'gt'      // >
  | 'gte'     // >=
  | 'between' // value: [min, max] (inclusive)
  | 'matches'; // 정규식 (string 전용)

/** 배열 한정자 */
export type Quantifier = 'none' | 'any' | 'all';

/** 집계 함수 */
export type AggFn = 'sum' | 'min' | 'max' | 'avg' | 'count';

// ============================================================================
// Layer 1 — DocumentSchema
// ============================================================================

export type FieldType =
  | 'text'             // 단일 텍스트 값
  | 'checkbox_cluster' // 체크박스 군집 (options 배열)
  | 'table_rows'       // 반복 행 묶음 (count + rows)
  | 'number_set';      // 숫자 집합 (합계 등 집계 용도)

export type ExtractorStrategy =
  | 'row_contains_label'  // 특정 anchor 텍스트가 포함된 행에서 추출
  | 'rows_after_header'   // anchor 텍스트가 있는 헤더 행 이후 모든 행
  | 'cell_value_match'    // 특정 셀 값 정규식 매칭
  | 'table_caption';      // 테이블 캡션 텍스트

/** rows_after_header anchor별 세부 설정 */
export interface AnchorConfig {
  anchor: string;
  /** 이 anchor로 매칭된 경우에만 적용되는 item_header_pattern */
  item_header_pattern?: string;
}

export interface FieldExtractor {
  strategy: ExtractorStrategy;
  /** 탐색 기준 텍스트 (부분 일치) */
  anchor?: string;
  /**
   * 복수 anchor 후보 (rows_after_header 전용).
   * 앞에서부터 순서대로 시도하며, 매칭 결과가 min_rows 미만이면 다음 anchor로 넘어갑니다.
   */
  anchors?: string[];
  /**
   * rows_after_header 전용: 헤더 이후 데이터 행이 이 값 미만이면 해당 매칭을 건너뜁니다.
   * 잘못된 테이블(소형 관리 테이블 등)이 먼저 매칭되는 경우 fallback anchor로 넘어가게 합니다.
   */
  min_rows?: number;
  /**
   * rows_after_header 전용: 설정 시 이 정규식과 첫 번째 셀이 일치하는 행만 항목으로 간주하여
   * count를 산출합니다. 복수 행이 하나의 회차를 이루는 포맷(예: 5행/회차)에 사용합니다.
   * anchors_config 내 anchor별 설정이 있으면 이 전역 설정보다 우선합니다.
   */
  item_header_pattern?: string;
  /**
   * rows_after_header 전용: anchor별 세부 설정.
   * 순서대로 시도하며, 각 anchor에 item_header_pattern을 개별 지정할 수 있습니다.
   * anchor/anchors와 병용 불가 — anchors_config가 있으면 anchor/anchors를 무시합니다.
   */
  anchors_config?: AnchorConfig[];
  /** 정규식 패턴 (cell_value_match 전용) */
  pattern?: string;
  /** 특정 테이블 인덱스 고정 (생략 시 전체 탐색) */
  table_index?: number;
}

export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  extractor: FieldExtractor;
  /** 필드 미탐지 시 required 규칙 자동 생성용 (anomaly_rules 명시 우선) */
  required?: boolean;
  /** checkbox_cluster 전용: 인식할 선택지 목록 */
  options?: string[];
  /** table_rows 전용: 최소 행 수 */
  min_count?: number;
}

// ── Condition Types ──────────────────────────────────────────────────────────

/** 필드 존재 여부 — triggered when found !== expected */
export interface ExistsCondition {
  type: 'exists';
  /** 탐색 대상 field id */
  field: string;
  /**
   * 정상 기대값.
   *   true  → "이 필드는 있어야 한다" → 없으면 anomaly
   *   false → "이 필드는 없어야 한다" → 있으면 anomaly
   */
  expected: boolean;
}

/** 배열 길이 비교 — table_rows.count 등 */
export interface CountCondition {
  type: 'count';
  field: string;
  op: CompareOp;
  /** between 시 [min, max], 그 외 단일 숫자 */
  value: number | [number, number];
}

/** 배열 항목 조건 */
export interface WhereClause {
  prop: string;
  op: CompareOp;
  value: unknown;
}

export interface ArrayMatchCondition {
  type: 'array_match';
  /**
   * 필드 경로 (점 표기).
   * e.g. "teaching_method.options", "weekly_plan.rows"
   */
  field: string;
  /**
   * none → "일치하는 항목이 하나도 없음" 이 anomaly
   * any  → "일치하는 항목이 하나라도 있음" 이 anomaly
   * all  → "모든 항목이 일치함" 이 anomaly
   */
  quantifier: Quantifier;
  where: WhereClause;
}

/** 단일 필드 값 비교 */
export interface ValueMatchCondition {
  type: 'value_match';
  field: string;
  op: CompareOp;
  value?: unknown;
  /** matches op 전용 정규식 문자열 */
  pattern?: string;
}

/** 배열 집계 후 비교 */
export interface AggregateCondition {
  type: 'aggregate';
  field: string;
  fn: AggFn;
  op: CompareOp;
  value: number;
}

export interface AndCondition {
  type: 'and';
  conditions: Condition[];
}

export interface OrCondition {
  type: 'or';
  conditions: Condition[];
}

export type Condition =
  | ExistsCondition
  | CountCondition
  | ArrayMatchCondition
  | ValueMatchCondition
  | AggregateCondition
  | AndCondition
  | OrCondition;

// ── Anomaly Rule ─────────────────────────────────────────────────────────────

export interface AnomalyRule {
  rule_id: string;
  severity: Severity;
  condition: Condition;
  message: string;
}

// ── Document Schema (최상위) ─────────────────────────────────────────────────

export interface DocumentSchema {
  schema_id: string;
  description: string;
  version?: string;
  fields: FieldDef[];
  anomaly_rules: AnomalyRule[];
}

// ============================================================================
// Layer 2 — Extracted Field Values
// ============================================================================

export interface FieldLocation {
  table_index?: number;
  row_index?: number;
  cell_index?: number;
}

export type CheckboxFormat = 'checkmark' | 'text-only' | 'unchecked' | 'bare-uncheck';

export interface CheckboxOption {
  option: string;
  checked: boolean;
  /** options 정의에 포함된 항목인지 여부 */
  recognized: boolean;
  format: CheckboxFormat;
}

export interface ExtractedCheckboxCluster {
  found: true;
  options: CheckboxOption[];
  location: FieldLocation;
}

export interface ExtractedTableRows {
  found: true;
  count: number;
  rows: string[][];
  location: FieldLocation;
}

export interface ExtractedText {
  found: true;
  value: string;
  location: FieldLocation;
}

export interface ExtractedNumberSet {
  found: true;
  values: number[];
  location: FieldLocation;
}

export interface ExtractedNotFound {
  found: false;
}

export type ExtractedField =
  | ExtractedCheckboxCluster
  | ExtractedTableRows
  | ExtractedText
  | ExtractedNumberSet
  | ExtractedNotFound;

// ============================================================================
// Layer 3 — Anomaly Result
// ============================================================================

export interface AnomalyHit {
  rule_id: string;
  severity: Severity;
  location?: FieldLocation;
  message: string;
  /** 실제 값 등 부가 컨텍스트 */
  detail?: string;
}

// ============================================================================
// Extraction Record (파일 단위 최종 수집 결과)
// ============================================================================

export interface ExtractionRecord {
  source_file: string;
  schema_id: string;
  extracted_at: string;
  fields: Record<string, ExtractedField>;
  anomalies: AnomalyHit[];
}
