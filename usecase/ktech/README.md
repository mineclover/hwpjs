# ktech 강의계획서 이상 탐지 파이프라인

## 요약
- **목적**: 한국기술교육대학교 온라인평생교육원 강의계획서 HWP 파일에서 필드를 자동 추출하고 이상 여부를 탐지한다.
- **진입점**: `scripts/extract-schemas.ts` — Stage 1 시작점 (HWP → JSON)
- **의존성**: `packages/hwpjs-adapter/src/anomaly/`, `scripts/schemas/lecture-plan-v1.json`

---

## 배경 및 목적

ktech 강의계획서는 HWP 포맷으로 납품된다. 파일 수가 많아 수동 검수가 어렵고, 템플릿 버전이 다양하여 파싱 로직이 단순하지 않다. 이 파이프라인은 다음 두 가지를 자동화한다.

1. HWP 파일에서 강의 계획 구조화 데이터(TableSchema) 추출
2. 추출 결과에 대해 사전 정의된 규칙 기반 이상 탐지 수행

검증 결과: 46개 파일 대상 46/46 추출 정확도.

---

## 파이프라인 흐름

```
pipeline/hwp/          (HWP 파일들)
        |
        | bun scripts/extract-schemas.ts
        v
pipeline/stage1/schemas/   (TableSchema JSON, 파일별)
pipeline/stage1/images/    (추출된 이미지)
        |
        | bun scripts/detect-anomalies.ts
        v
pipeline/stage1/anomalies/anomalies.json   (ExtractionRecord 배열)
pipeline/stage1/anomalies/report.html      (시각화 리포트)
        |
        | bun pipeline:validate
        v
pipeline/stage1/validation/validation.json  (ground truth 교차 검증 결과)
pipeline/stage1/validation/validation.html
```

ground truth 준비는 별도 Step 0으로 선행한다. `scripts/parse-contents-list.ts` 참고.

---

## 폴더 구조

| 경로 | 설명 |
|------|------|
| `scripts/extract-schemas.ts` | Stage 1: HWP → TableSchema JSON |
| `scripts/detect-anomalies.ts` | Stage 2: 이상 탐지 실행 |
| `scripts/validate-extraction.ts` | Stage 3: ground truth 교차 검증 |
| `scripts/parse-contents-list.ts` | JS 형식 강의 목차 → contents-list.json |
| `scripts/schemas/lecture-plan-v1.json` | 필드 정의 + 이상 탐지 규칙 |
| `packages/hwpjs-adapter/src/anomaly/` | 이상 탐지 프레임워크 코어 |
| `pipeline/hwp/` | 입력 HWP 파일들 |
| `pipeline/stage1/` | 파이프라인 출력 (schemas, anomalies, validation) |
| `pipeline/contents-list.json` | ground truth (과정별 회차 수) |

---

## 빠른 시작

```bash
# Step 0: ground truth 준비 (최초 1회)
bun pipeline:parse-contents pipeline/contents_list.js

# Step 1: HWP 추출
bun scripts/extract-schemas.ts pipeline/hwp pipeline/stage1

# Step 2: 이상 탐지
bun scripts/detect-anomalies.ts pipeline/stage1/schemas scripts/schemas/lecture-plan-v1.json pipeline/stage1/anomalies

# Step 3: 검증
bun pipeline:validate
```

단계별 상세 옵션은 `pipeline-guide.md`, 스키마/규칙 레퍼런스는 `schema-reference.md` 참고.

---

## ktech 특이사항

ktech 강의계획서에는 두 가지 주차별 계획 테이블 포맷이 존재한다.

| 구분 | 헤더 키워드 | 행 구조 | 대상 과정 |
|------|------------|---------|----------|
| 일반 템플릿 | `구성내용` | 1행/회차 | 대부분 |
| KOR 템플릿(072) | `주요내용` | 5행/회차 (회차번호/학습목표/학습내용/능력단위요소/이론실습사례) | 072 |
| KOR 혼합(073/075/076) | `구성내용` + `주요내용` 공존 | 두 테이블 모두 존재 | 073, 075, 076 |

`lecture-plan-v1.json`의 `anchors_config` + `min_rows` 조합으로 올바른 테이블을 선택한다. 상세는 `schema-reference.md`의 `rows_after_header` 항목 참고.
