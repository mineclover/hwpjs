# HWPJS

한글과컴퓨터의 한/글 문서 파일(.hwp)을 읽고 파싱하는 라이브러리입니다.

본 제품은 한글과컴퓨터의 한/글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.  
[공개 문서 다운로드](https://www.hancom.com/etc/hwpDownload.do)

## 프로젝트 구조

이 프로젝트는 Bun 워크스페이스를 사용한 모노레포 구조입니다.

```
hwpjs/
├── crates/
│   └── hwp-core/          # 공유 Rust 라이브러리 (핵심 HWP 파싱 로직)
├── packages/
│   ├── hwpjs/             # 멀티 플랫폼 패키지 (Node.js, Web, React Native)
│   └── hwpjs-server/      # REST API 서버
├── examples/              # 사용 예제
│   ├── node/              # Node.js 예제
│   ├── web/               # Web 예제
│   ├── react-native/      # React Native 예제
│   └── cli/               # CLI 사용 예제
├── docs/                  # 문서 사이트 (Rspress)
└── legacy/                # 기존 JavaScript 구현
```

## 기술 스택

### 현재 버전 (Rust 기반)

- **Rust**: 핵심 로직 구현
- **Craby**: React Native 바인딩
- **NAPI-RS**: Node.js 네이티브 모듈
- **Bun**: 워크스페이스 관리
- **Rspress**: 문서 사이트

### Legacy 버전 (JavaScript)

- [sheetjs - CFB](http://sheetjs.com) - Compound Binary File을 읽기 위한 플러그인
- [pako](https://github.com/nodeca/pako) - Compound Binary File에서 일부 압축 된 코드를 읽기 위한 플러그인(zlib)

## 참고한 프로젝트

- [pyhwp](https://github.com/mete0r/pyhwp)
- [hwpjs](https://github.com/hahnlee/hwp.js)
- [ruby-hwp](https://github.com/mete0r/ruby-hwp)
- [libhwp](https://github.com/accforaus/libhwp)
- [hwplib](https://github.com/neolord0/hwplib)

## 개발 시작하기

### 환경 설정

mise를 사용하여 필요한 도구를 설치합니다:

```bash
mise install
```

### 스크립트

- `bun run test:rust` - Rust 테스트 실행
- `bun run test:node` - Node.js 테스트 실행
- `bun run test:e2e` - E2E 테스트 실행
- `bun run lint` - 린트 검사
- `bun run format` - 코드 포맷팅
- `bun run build` - 전체 빌드

## 사용법

### CLI 사용

명령줄에서 직접 HWP 파일을 변환할 수 있습니다:

```bash
# 전역 설치
npm install -g @ohah/hwpjs

# JSON 변환
hwpjs to-json document.hwp -o output.json --pretty

# Markdown 변환
hwpjs to-markdown document.hwp -o output.md --include-images

# 파일 정보 확인
hwpjs info document.hwp

# 이미지 추출
hwpjs extract-images document.hwp -o ./images

# 배치 변환
hwpjs batch ./documents -o ./output --format json --recursive
```

더 자세한 내용은 [CLI 가이드](https://ohah.github.io/hwpjs/guide/cli)를 참고하세요.

### 프로그래밍 방식 사용

자세한 API 사용법은 [@ohah/hwpjs README](packages/hwpjs/README.md)를 참고하세요.

### REST API 서버

```bash
cd packages/hwpjs-server
bun run start
```

```bash
# HWP → JSON 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/json

# HWP → HTML 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/html

# HWP → Markdown 변환
curl -X POST -F "file=@document.hwp" http://localhost:3000/api/convert/markdown
```

자세한 내용은 [@ohah/hwpjs-server README](packages/hwpjs-server/README.md)를 참고하세요.

### TypeScript 타입

`toJson()` 반환값에 대한 TypeScript 타입을 제공합니다:

```typescript
import type { HwpDocument, Table, TableCell } from '@ohah/hwpjs/types/hwp-document';

const doc: HwpDocument = JSON.parse(toJson(buffer));
```

자세한 타입 정보는 [@ohah/hwpjs README - TypeScript 타입](packages/hwpjs/README.md#typescript-타입)을 참고하세요.

## 이슈 제안 및 건의

해당 깃허브에 남겨주세요.

## 라이센스

이 프로젝트는 [MIT 라이센스](LICENSE)를 따릅니다.
