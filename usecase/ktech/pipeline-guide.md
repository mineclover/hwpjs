# 파이프라인 실행 가이드

## 요약
- **목적**: ktech 강의계획서 이상 탐지 파이프라인 단계별 실행 방법
- **진입점**: `scripts/extract-schemas.ts:93` — `main()` 함수
- **의존성**: `packages/hwpjs-adapter/src/anomaly/index.ts` (공개 API)

---

## Step 0: contents-list.json 준비

ground truth 파일로, 검증(Step 3)에만 필요하다. 최초 1회 실행한다.

**입력**: ktech 사이트에서 내려받은 `contents_list.js` (JS 변수 선언 형식)
**출력**: `pipeline/contents-list.json` — `CourseEntry[]` 배열

```bash
bun pipeline:parse-contents pipeline/contents_list.js
# 또는 직접 실행
bun scripts/parse-contents-list.ts pipeline/contents_list.js pipeline/contents-list.json
```

`parse-contents-list.ts`는 `contents_list` 변수를 `new Function()`으로 eval하여 파싱한다 (`scripts/parse-contents-list.ts:22-28`). 출력 구조는 아래와 같다.

```json
[{ "index": 1, "title": "과정명", "chapter_count": 16, "chapters": [...] }]
```

---

## Step 1: HWP → TableSchema JSON

**스크립트**: `scripts/extract-schemas.ts`
**입력**: HWP 파일 폴더
**출력**:
- `<output>/schemas/` — 파일별 `SchemaFile` JSON (TableSchema 배열 포함)
- `<output>/images/` — 추출된 이미지 파일 (`<prefix>-img-<id>.<ext>`)

```bash
bun scripts/extract-schemas.ts pipeline/hwp pipeline/stage1
```

`output` 인자를 생략하면 `<hwp-folder>/../output`에 저장된다.

### 처리 흐름

`scripts/extract-schemas.ts:31-91`에서 파일별로 다음을 수행한다.

1. `hwpjs.toHtml()` 실행 후 data URL 정규식으로 이미지 추출 → `ImageMap` 구성
2. `hwpjs.toJson()` 파싱 후 `transformHwpTablesWithSchema()` 적용
3. `extractAllTableSchemas()` 로 `TableSchema[]` 수집
4. 이미지를 `images/` 폴더에 저장하고, `src`를 상대경로로 교체

### 출력 JSON 구조

```json
{
  "file": "001. 강의계획서_...",
  "extractedAt": "2026-02-27T...",
  "schemas": [ /* TableSchema[] */ ]
}
```

파일명 앞 숫자(`001`, `021` 등)가 이미지 파일명 prefix가 된다 (`scripts/extract-schemas.ts:119-120`).

---

## Step 2: 이상 탐지

**스크립트**: `scripts/detect-anomalies.ts`
**입력**:
- `<schemas-dir>` — Step 1 출력의 `schemas/` 폴더
- `<schema-json>` — 필드 정의 + 규칙 파일 (`scripts/schemas/lecture-plan-v1.json`)

**출력**:
- `<output>/anomalies.json` — `ExtractionRecord[]` 배열
- `<output>/report.html` — 파일별 이상 목록 시각화 리포트

```bash
bun scripts/detect-anomalies.ts \
  pipeline/stage1/schemas \
  scripts/schemas/lecture-plan-v1.json \
  pipeline/stage1/anomalies
```

`output` 인자를 생략하면 `<schemas-dir>/../anomalies`에 저장된다.

### 처리 흐름

`scripts/detect-anomalies.ts:39-50`의 `processFile()` 참고.

1. `extractAllFields()` — 스키마 필드 정의에 따라 TableSchema에서 값 추출
2. `evaluateRules()` — 규칙 조건 평가 후 `AnomalyHit[]` 반환

### anomalies.json 구조

```json
[{
  "source_file": "001. 강의계획서_....hwp",
  "schema_id": "lecture-plan-v1",
  "fields": { "teaching_method": { "found": true, "options": [...] }, ... },
  "anomalies": [{ "rule_id": "...", "severity": "ERROR", "message": "..." }]
}]
```

`report.html`은 severity별 집계 카드, 상위 rule_id 빈도표, 파일별 접힌 목록으로 구성된다.

---

## Step 3: 검증 (ground truth 교차 검증)

**스크립트**: `scripts/validate-extraction.ts`
**입력**:
- `anomalies.json` — Step 2 출력
- `contents-list.json` — Step 0 출력 (ground truth)

**출력**:
- `<output>/validation.json` — `ValidationResult[]` + 요약 통계
- `<output>/validation.html` — 테이블 형식 HTML 리포트

```bash
bun pipeline:validate
# 경로를 직접 지정할 경우
bun scripts/validate-extraction.ts \
  pipeline/stage1/anomalies/anomalies.json \
  pipeline/contents-list.json \
  pipeline/stage1/validation
```

### 매칭 방법

HWP 파일명에서 과정 제목을 추출한 후 contents-list와 퍼지 매칭한다 (`scripts/validate-extraction.ts:72-103`).

- 파일명 패턴: `001. 강의계획서_<과정명>_<강사명>.hwp`
- 정규화: 특수문자/공백 제거 후 소문자 비교
- 퍼지 매칭: 완전 일치 또는 부분 포함

### 검증 상태 코드

| 상태 | 설명 |
|------|------|
| `OK` | 추출 회차 수 = ground truth |
| `COUNT_MISMATCH` | 추출 수와 실제 수 불일치 |
| `EXTRACTION_ERROR` | `weekly_plan` 추출 자체 실패 |
| `NO_GROUND_TRUTH` | contents-list에서 과정명 매칭 실패 |

---

## 전체 명령어 요약

```bash
# Step 0 (최초 1회)
bun pipeline:parse-contents pipeline/contents_list.js

# Step 1
bun scripts/extract-schemas.ts pipeline/hwp pipeline/stage1

# Step 2
bun scripts/detect-anomalies.ts pipeline/stage1/schemas scripts/schemas/lecture-plan-v1.json pipeline/stage1/anomalies

# Step 3
bun pipeline:validate
```
