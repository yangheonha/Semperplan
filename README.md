# SemperPlan v3

월간/주간 Dienstplan 파일에서 내 일정만 골라 iPhone 캘린더에 넣는 도구입니다.

## 기능
- Excel / CSV 업로드
- 월간 일정 / 주간 일정 구분
- 최신 주간 파일의 첫 주 일정 우선 대체
- 작품명 / 파트 / 그룹 버튼 선택
- 내 일정 확인 및 체크 해제
- iPhone Calendar용 `.ics` 다운로드
- Google Calendar 연동 준비 파일 포함

## 실행
```bash
npm install
npm run dev
```

지금 바로 가능한 것은 `.ics` 다운로드입니다. Google Calendar 자동 삭제/추가/수정은 Google Cloud OAuth Client ID를 만든 뒤 다음 단계에서 붙이면 됩니다.
