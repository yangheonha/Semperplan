# SemperPlan v8

PDF 원본 화면을 그대로 보면서 텍스트를 눌러 작품을 선택하고, 선택된 일정으로 **SemperPlan 전용 Google Calendar를 부분 동기화**하는 버전입니다.

## v8 핵심 수정

v7은 SemperPlan 캘린더의 기존 일정을 모두 삭제하는 방식이었지만, v8은 더 안전하게 바뀌었습니다.

- 기존 SemperPlan 캘린더 전체 삭제 ❌
- 현재 선택된 최신 일정과 겹치는 기존 일정만 삭제 ✅
- 안 겹치는 기존 SemperPlan 일정은 유지 ✅
- 개인 기본 캘린더는 건드리지 않음 ✅

## 중복 판단 기준

기존 Google Calendar 일정과 새 선택 일정이 아래 중 하나에 해당하면 겹치는 일정으로 봅니다.

1. 날짜 + 시작 시간 + 종료 시간이 같음
2. SemperPlan-ID가 같음

겹치는 기존 일정은 삭제한 뒤, 현재 선택된 최신 일정이 새로 추가됩니다.

## 기능

- PDF 원본 화면 그대로 표시
- PDF 위 텍스트 클릭 가능
- 작품 선택 필터 저장
- 이름/성 저장
- 남자/여자/전체 필터 저장
- 추가 작품명/별명 저장
- 최신 주간 PDF 첫 주 일정 우선 적용
- 최종 일정 개별 제외
- Google Calendar 부분 동기화
- `.ics 백업 다운로드` 유지

## Google Calendar 설정

Vercel 환경변수에 다음 값을 추가해야 합니다.

```bash
VITE_GOOGLE_CLIENT_ID=구글에서_받은_OAuth_Client_ID
```

Google OAuth Client의 Authorized JavaScript origins에는 Vercel 앱 주소를 넣어야 합니다.

## Vercel 반영

```bash
git add .
git commit -m "sync only overlapping SemperPlan events"
git push
```
