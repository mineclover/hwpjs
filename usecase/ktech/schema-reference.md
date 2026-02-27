# 스키마 + 규칙 레퍼런스

## 요약
- **목적**: `DocumentSchema` 구조, `FieldExtractor` 전략 옵션, `AnomalyRule` 조건 타입, 현재 `lecture-plan-v1.json` 규칙 설명
- **진입점**: `packages/hwpjs-adapter/src/anomaly/types.ts:197` — `DocumentSchema` 인터페이스
- **의존성**: `packages/hwpjs-adapter/src/anomaly/extractor.ts`, `evaluator.ts`

---

## DocumentSchema 구조

`scripts/schemas/lecture-plan-v1.json`은 `DocumentSchema` 타입을 따른다 (`types.ts:197-203`).

```json
{
  "schema_id": "lecture-plan-v1",
  "description": "강의계획서",
  "version": "1.0.0",
  "fields": [ /* FieldDef[] */ ],
  "anomaly_rules": [ /* AnomalyRule[] */ ]
}
```

| 속성 | 타입 | 설명 |
|------|------|------|
| `schema_id` | string | 고유 식별자. anomalies.json의 `schema_id`에 기록된다. |
| `fields` | `FieldDef[]` | 추출할 필드 정의 목록 |
| `anomaly_rules` | `AnomalyRule[]` | 규칙 위반 감지 조건 목록 |

---

## FieldDef

`types.ts:88-99` 참고.

| 속성 | 타입 | 설명 |
|------|------|------|
| `id` | string | 필드 식별자. anomalies.json의 `fields` 키가 된다. |
| `type` | FieldType | `text` / `checkbox_cluster` / `table_rows` / `number_set` |
| `extractor` | FieldExtractor | 추출 전략 및 옵션 |
| `required` | boolean | 미탐지 시 자동 `exists` 규칙 생성용 힌트 |
| `options` | string[] | `checkbox_cluster` 전용: 인식할 선택지 목록 |
| `min_count` | number | `table_rows` 전용: 최소 행 수 |

---

## FieldExtractor 전략

`types.ts:43-47`의 `ExtractorStrategy`. 구현 위치는 `extractor.ts`.

### row_contains_label

anchor 텍스트가 포함된 행 전체를 스캔하여 값을 추출한다 (`extractor.ts:93-136`).

- `type: checkbox_cluster` — 해당 행의 모든 셀에서 체크박스 파싱
- `type: text` — anchor 셀 제외 나머지 셀 값을 병합

```json
{ "strategy": "row_contains_label", "anchor": "이론/실습/사례" }
```

### rows_after_header

anchor 텍스트가 있는 헤더 행 이후 모든 데이터 행을 `table_rows`로 반환한다 (`extractor.ts:147-202`).

ktech 주차별 계획 테이블 추출에 사용한다.

#### 주요 옵션

| 옵션 | 설명 |
|------|------|
| `anchor` | 단일 헤더 탐색 텍스트 |
| `anchors` | 복수 anchor 후보 (순서대로 시도) |
| `anchors_config` | anchor별 세부 설정. `anchor`/`anchors`보다 우선한다. |
| `min_rows` | 헤더 이후 데이터 행이 이 값 미만이면 해당 매칭을 건너뛰고 다음 anchor로 이동한다. |
| `item_header_pattern` | 정규식. 첫 번째 셀이 일치하는 행만 회차로 카운트한다. 5행/회차 포맷 대응에 사용. |

#### anchors_config 구조

`types.ts:50-54`의 `AnchorConfig`. anchor마다 `item_header_pattern`을 개별 지정할 수 있다.

```json
"anchors_config": [
  { "anchor": "구성내용" },
  { "anchor": "주요내용", "item_header_pattern": "^\\d+$" }
]
```

위 설정의 동작:
1. 전체 테이블을 순회하며 "구성내용" 헤더를 탐색한다.
2. 헤더 이후 데이터 행이 `min_rows` 이상이면 해당 결과를 반환한다. (1행/회차, count = 데이터 행 수)
3. 조건 미충족 시 "주요내용" 헤더로 재탐색한다.
4. `item_header_pattern: "^\\d+$"` 이므로 첫 번째 셀이 숫자인 행만 카운트한다. (5행/회차 포맷)

#### ktech 적용 예시

073/075/076 KOR 과정은 "구성내용" 테이블(소형, 1~2행)과 "주요내용" 테이블(대형, 5행/회차)이 공존한다. `min_rows: 3`을 설정하면 소형 "구성내용" 테이블을 건너뛰고 "주요내용" 테이블을 선택한다.

### cell_value_match

정규식 `pattern`과 일치하는 첫 번째 셀을 `text`로 반환한다 (`extractor.ts:232-256`).

### table_caption

테이블 캡션 텍스트를 `text`로 반환한다 (`extractor.ts:208-226`). `anchor`를 지정하면 해당 텍스트가 포함된 캡션만 선택한다.

---

## AnomalyRule + Condition 타입

`types.ts:188-193`의 `AnomalyRule`.

```json
{
  "rule_id": "teaching_method.missing",
  "severity": "ERROR",
  "condition": { ... },
  "message": "이론/실습/사례 행을 찾을 수 없음"
}
```

`severity`는 `CRITICAL` / `ERROR` / `WARN` / `INFO` 중 하나.

### Condition 종류

`types.ts:177-184` 참고.

#### exists

필드 존재 여부 확인.

```json
{ "type": "exists", "field": "teaching_method", "expected": true }
```

`expected: true` — 필드가 없으면 anomaly.
`expected: false` — 필드가 있으면 anomaly.

#### array_match

배열 항목에 대해 한정자(`quantifier`) 기반 조건 평가.

```json
{
  "type": "array_match",
  "field": "teaching_method.options",
  "quantifier": "none",
  "where": { "prop": "checked", "op": "eq", "value": true }
}
```

| quantifier | 의미 |
|------------|------|
| `none` | 일치 항목이 하나도 없으면 anomaly |
| `any` | 일치 항목이 하나라도 있으면 anomaly |
| `all` | 모든 항목이 일치하면 anomaly |

`field`는 점 표기법으로 중첩 경로를 지정한다. `teaching_method.options`는 `fields.teaching_method.options` 배열을 의미한다.

#### count

`table_rows` 필드의 `count`를 비교연산자로 검사.

```json
{ "type": "count", "field": "weekly_plan", "op": "between", "value": [8, 30] }
```

#### value_match

단일 필드 값 비교. `matches` op 사용 시 `pattern`(정규식 문자열)을 함께 지정한다.

#### aggregate

배열 항목의 집계(`sum`/`min`/`max`/`avg`/`count`) 후 비교.

#### and / or

복수 조건 조합. `conditions` 배열을 가진다.

---

## lecture-plan-v1.json 현재 규칙 목록

`scripts/schemas/lecture-plan-v1.json:46-120` 참고.

| rule_id | severity | 판단 기준 |
|---------|----------|-----------|
| `teaching_method.missing` | ERROR | `teaching_method` 필드가 탐지되지 않음 (`exists: false`) |
| `teaching_method.nothing_checked` | WARN | `teaching_method`는 탐지되었으나 options 중 `checked: true`인 항목이 하나도 없음 |
| `teaching_method.unrecognized_option` | INFO | `teaching_method.options`에 `recognized: false`인 항목이 하나라도 존재 (bare-uncheck 등) |
| `weekly_plan.missing` | ERROR | `weekly_plan` 필드가 탐지되지 않음 |
| `file_provision.exists_but_nothing_checked` | WARN | `file_provision`은 탐지되었으나 체크된 항목 없음 |

`teaching_method.nothing_checked`는 `and` 조건으로, `teaching_method.missing`이 발생한 파일에는 트리거되지 않는다 (`types.ts:167-170`).

---

## 추출 결과 타입 (ExtractedField)

`types.ts:210-259` 참고. 필드 타입별 추출 결과 구조는 다음과 같다.

| 필드 타입 | 결과 타입 | 주요 속성 |
|-----------|-----------|-----------|
| `checkbox_cluster` | `ExtractedCheckboxCluster` | `options: CheckboxOption[]` |
| `table_rows` | `ExtractedTableRows` | `count: number`, `rows: string[][]` |
| `text` | `ExtractedText` | `value: string` |
| `number_set` | `ExtractedNumberSet` | `values: number[]` |
| (미탐지) | `ExtractedNotFound` | `found: false` |

`CheckboxOption`의 `format` 속성(`types.ts:215`):

| format | 의미 |
|--------|------|
| `checkmark` | ☑/■/✓ 등 체크 문자 포함 |
| `text-only` | 체크 문자 없이 라벨 텍스트만 존재 (체크됨으로 판단) |
| `unchecked` | ▢/□ 포함, 체크 안 됨 |
| `bare-uncheck` | ▢/□ 단독 (라벨 없음), `recognized: false` |
