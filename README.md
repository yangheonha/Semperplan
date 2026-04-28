# SemperPlan v10 Final Candidate

SemperPlan은 오페라극장 합창단 Dienstplan PDF를 업로드해, 사용자에게 해당하는 일정만 한 줄 목록으로 추출하고, 체크된 일정만 Google Calendar의 **SemperPlan 전용 캘린더**에 안전하게 동기화하는 웹앱입니다.

## 최종 방식

- `.ics` 다운로드 중심이 아니라 **Google Calendar 자동 동기화** 중심
- `.ics`는 백업용으로만 유지
- 개인 기본 캘린더는 수정하지 않음
- `SemperPlan` 전용 Google Calendar만 수정
- 전체 삭제가 아니라, 선택된 일정과 날짜/시간이 겹치는 기존 SemperPlan 일정만 삭제
- 날짜 범위 밖 기존 일정은 유지

## 핵심 기능

### 파일 업로드

- 월간 PDF 업로드 버튼
- 주간 PDF 업로드 버튼
- 월간/주간 자동 판별 대신 사용자가 직접 구분
- 같은 시간대에 월간/주간이 겹치면 주간만 목록에 표시

### 필터

- 성별: 남자 / 여자 / 전체
- 성: 빈칸 기본값, 입력 후 저장
- 이름: 빈칸 기본값, 입력 후 저장
- 파트: 기본값 `Tenor`
- Tenor 계열 인식: Tenor, Tenore, Ténor, Herren, Alle Herren
- 작품: PDF 업로드 후 자동 생성, 처음에는 전부 해제
- 선택한 작품과 추가 작품명/별명은 브라우저에 저장

### 일정 목록

- PDF 원문에 가까운 한 줄 리스트
- 체크박스로 최종 선택
- 표시 항목: 체크박스, 날짜, 시간, 월간/주간, 캘린더 제목, PDF 원문
- 전체 체크 / 전체 해제 기능

### 자동 체크

- chorfrei / 1/2 chorfrei는 기본 체크
- 성/이름이 포함된 일정 자동 체크
- 파트 조건에 맞는 일정 자동 체크
- 성별 조건에 맞는 일정 자동 체크
- 저장된 작품 필터에 해당하는 일정 자동 체크
- 사용자는 언제든 직접 체크/해제 가능

## 시간 규칙

- Nachstudium: 1시간
- Probe / mus. Probe / mus. Proben: 2시간
- 그 외 일정: 3시간
- chorfrei: 종일 일정
- 1/2 chorfrei 오전: 10:00–11:00
- 1/2 chorfrei 오후: 18:00–19:00

## 제목 규칙

- chorfrei: `🔴 chorfrei`
- 1/2 chorfrei 오전: `🔴 1/2 chorfrei 오전`
- 1/2 chorfrei 오후: `🔴 1/2 chorfrei 오후`
- 공연 / Vorstellung: `Vs 작품명`
- 일반 Probe: `P 작품명`
- mus. Probe / mus. Proben: `mP 작품명`
- szen. Probe: `sP 작품명`
- BP / BO / KP / KHP / OHP / GP: 그대로 앞에 붙임

## Google Calendar 동기화

동기화 버튼을 누르면 다음 순서로 처리합니다.

1. 체크된 일정의 날짜 범위 계산
2. Google Calendar에서 `SemperPlan` 전용 캘린더 찾기
3. 없으면 새로 생성
4. 해당 날짜 범위 안의 기존 SemperPlan 일정 조회
5. 날짜+시작+종료 시간이 겹치거나 SemperPlan-ID가 같은 기존 일정만 삭제
6. 체크된 최신 일정 추가
7. 안 겹치는 기존 일정과 범위 밖 일정은 유지

## Google Cloud / Vercel 설정

Vercel 환경변수에 아래 값을 넣어야 Google Calendar 연결 버튼이 활성화됩니다.

```bash
VITE_GOOGLE_CLIENT_ID=Google OAuth Client ID
```

Google OAuth Client의 Authorized JavaScript origins에는 실제 Vercel 주소를 넣어야 합니다.

예:

```text
https://semperplan.vercel.app
```

끝에 `/`는 붙이지 않습니다.

앱이 Google OAuth 테스트 모드라면, Google Cloud의 Test users에 로그인할 Gmail을 추가해야 합니다.

## 실행

```bash
npm install
npm run dev
```

## 배포

```bash
git add .
git commit -m "finalize SemperPlan v10"
git push
```
