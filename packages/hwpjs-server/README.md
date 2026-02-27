# @ohah/hwpjs-server

HWP 파일 변환을 위한 REST API 서버입니다.

## 설치

```bash
bun install
```

## 실행

```bash
# 개발 모드 (watch)
bun run dev

# 프로덕션
bun run start

# 포트 변경
PORT=8080 bun run start
```

## API 엔드포인트

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-23T03:45:13.580Z"
}
```

### HWP → JSON

```
POST /api/convert/json
Content-Type: multipart/form-data
```

**Request:**
- `file`: HWP 파일 (multipart/form-data)

**Response:**
```json
{
  "success": true,
  "data": {
    "file_header": { ... },
    "doc_info": { ... },
    "body_text": { ... }
  }
}
```

### HWP → HTML

```
POST /api/convert/html
Content-Type: multipart/form-data
```

**Query Parameters:**
- `includeImages`: 이미지 포함 여부 (기본값: `true`)

**Response:**
```json
{
  "success": true,
  "data": {
    "html": "<!DOCTYPE html>..."
  }
}
```

### HWP → Markdown

```
POST /api/convert/markdown
Content-Type: multipart/form-data
```

**Query Parameters:**
- `imageFormat`: 이미지 형식 (`base64` 또는 `blob`, 기본값: `base64`)

**Response:**
```json
{
  "success": true,
  "data": {
    "markdown": "# HWP 문서\n...",
    "images": []
  }
}
```

### HWP → body_text (TableSchema 포함)

```
POST /api/convert/body-text
Content-Type: multipart/form-data
```

HWP 문서의 body_text를 반환하며, 테이블은 TableSchema 형식으로 변환됩니다.

**Response:**
```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "index": 0,
        "paragraphs": [
          {
            "tableSchema": {
              "rows": [...],
              "merges": [...]
            }
          }
        ]
      }
    ]
  }
}
```

### HWP → TableSchema Only

```
POST /api/convert/table-schemas
Content-Type: multipart/form-data
```

HWP 문서에서 테이블만 추출하여 TableSchema 배열로 반환합니다.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "rows": [
        { "cells": [{ "value": "셀1" }, { "value": "셀2" }] },
        { "cells": [{ "value": "셀3" }, { "value": "셀4" }] }
      ],
      "merges": [
        { "start": { "row": 0, "col": 0 }, "end": { "row": 1, "col": 0 } }
      ]
    }
  ],
  "count": 1
}
```

### 파일 정보

```
POST /api/info
Content-Type: multipart/form-data
```

**Response:**
```json
{
  "success": true,
  "data": {
    "signature": "HWP Document File",
    "version": "5.0.3.0",
    "document_flags": ["compressed"],
    "license_flags": [],
    "encrypt_version": 4,
    "kogl_country": 0
  }
}
```

## 사용 예시

### cURL

```bash
# 파일 정보 조회
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/info

# JSON 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/json

# HTML 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/html

# Markdown 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/markdown

# body_text (TableSchema 포함)
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/body-text

# TableSchema만 추출
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/table-schemas
```

### JavaScript (fetch)

```javascript
const formData = new FormData();
formData.append('file', hwpFile);

const response = await fetch('http://localhost:3000/api/convert/json', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log(result.data);
```

## TypeScript 타입

서버에서 사용하는 타입들은 `@ohah/hwpjs`에서 제공됩니다:

```typescript
import type {
  HwpDocument,
  FileHeader,
  DocInfo,
  BodyText,
  Section,
  Paragraph,
  Table,
  TableCell,
} from '@ohah/hwpjs/types/hwp-document';
```

자세한 타입 정보는 [@ohah/hwpjs README](../hwpjs/README.md#typescript-타입)를 참고하세요.

## 라이선스

MIT
