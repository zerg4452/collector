# 타이머 UI 개선 + 영상 단축키 + 풀스크린 버그 설계

작성일: 2026-06-16

## 배경

운동 루틴 3-mode 중 `timer` 모드의 사용성을 개선하고, 영상 키보드
단축키를 추가하며, 전체화면 해제 후 플로팅 레이어가 사라지는 버그를
수정한다.

작업은 5개 항목으로 구성된다. 1~4번은 확정, 5번은 잠정(아래 결정 게이트).

## 1. 타이머 남은시간 초만 표시

timer 모드의 카운트다운 박스가 `0:59` 형식 대신 초 숫자만 표시한다.

- 순수 헬퍼 `formatRemainingSeconds(seconds: number): string` 를
  `src/domain/workout.ts` 에 추가. 동작 중이면 정수 초 문자열(`"59"`),
  0 이하면 `"--"`.
- routine 모드 휴식 타이머는 기존 `formatSeconds`(`m:ss`)를 그대로 쓴다.
- WorkoutView 의 timer 모드 timer-box 만 새 헬퍼를 사용한다.

## 2. 타이머 카운트

timer 모드에서 타이머를 시작한 횟수를 표시한다.

- `App.tsx` 에 비영속 state `const [timerCount, setTimerCount] = useState(0)`
  추가. (리로드 시 0으로 초기화, IndexedDB 저장하지 않는다.)
- `handleTimer(seconds)` 가 타이머를 *시작*할 때만 +1 한다. 즉
  `toggleTimer` 결과의 `remaining > 0` 일 때 증가. 같은 버튼 재클릭으로
  인한 취소(remaining 0)는 증가하지 않는다.
- 표시는 `"3회"` 형식. (드래그 핸들 다음, 가장 왼쪽 영역.)
- 카운트 초기화 버튼: 누르면 `setTimerCount(0)`. 60초 버튼 오른쪽에 둔다.

## 3. timer 플로팅 레이어 순서

timer 모드 플로팅 컨트롤의 좌→우 순서:

1. 드래그 핸들 (이동용, 유지)
2. 카운트 표시 (`x회`)
3. 30초 버튼
4. 60초 버튼
5. 카운트 초기화 버튼
6. 남은초 박스
7. 다음 영상 버튼
8. 전체화면 버튼

`src/styles.css` 의 `.floating-control--timer` grid 를 8열로 재정의한다.
권장 컬럼: `36px 56px 82px 82px 40px 64px 40px 40px`
(드래그 / 카운트 / 30 / 60 / 초기화 / 남은초 / 다음 / 전체화면).
`min-width: 0; max-width: max-content;` 유지.

WorkoutView 의 timer 분기 JSX 를 위 순서로 재배치한다. 카운트 표시와
초기화 버튼이 추가된다.

## 4. 전체화면 해제 후 플로팅 숨김 버그 수정

### 원인

플로팅 컨트롤은 `.video-stage`(overflow 잘림) 안에 `position: absolute`
로 배치되고 `transform: translate(x, y)` 로 이동한다. 드래그 클램프가
`window.innerWidth/innerHeight` 기준이다(`App.tsx` 의 `handleDragStart`).
전체화면 중에는 stage 가 화면 전체 크기라 위치가 큰 값으로 저장될 수
있고, 해제하면 stage 가 작아져 플로팅이 stage 밖으로 나가 잘려 보이지
않는다.

### 수정

- `handleDragStart` 의 `onMove` 클램프를 `window` 대신 플로팅의
  offsetParent(stage) 경계 기준으로 바꾼다. 플로팅 버튼의
  `offsetParent`(stage) 의 `clientWidth/clientHeight` 와 컨트롤 자신의
  `offsetWidth/offsetHeight` 로 클램프한다.
- 위치를 stage 내로 끌어들이는 순수 헬퍼
  `clampFloatingPosition(pos, stageW, stageH, controlW, controlH)` 를
  `src/domain/workout.ts` 에 추가하고 드래그·재클램프 양쪽에서 쓴다.
  최소 마진 12px 유지, 최대 `stage - control - 12`.
- `fullscreenchange` 와 `resize` 이벤트에서 저장된
  `floatingControlPosition` 을 현재 stage 기준으로 재클램프해
  화면 밖이면 끌어들인다. (WorkoutView 가 stage ref 를 가지므로,
  재클램프 콜백을 prop 으로 받거나 WorkoutView 에서 직접 stage 크기를
  읽어 부모에 새 위치를 통지한다.)

## 5. (잠정) 영상 단축키 + YouTube IFrame API

### 결정 게이트

구현 후 브라우저에서 테스트한다. 만족스럽지 않으면 5번 전체(IFrame API
전환 + F키 + 방향키)를 되돌리고 1~4번만 출시한다. 5번 커밋을 분리해
되돌리기 쉽게 한다.

### IFrame Player API 전환

- 현재 `toYoutubeEmbedUrl` 가 만든 URL 로 `<iframe src>` 를 직접 렌더한다.
  이를 YouTube IFrame Player API 로 전환한다.
- API 스크립트(`https://www.youtube.com/iframe_api`)를 1회 로드하고
  전역 `onYouTubeIframeAPIReady` 로 준비를 감지한다.
- 플레이어 인스턴스를 ref 로 유지하고, 영상이 바뀌면 iframe 을 교체하는
  대신 `player.loadVideoById(videoId)` 를 호출한다.
- embed URL 에 `enablejsapi=1` 와 `origin` 을 포함한다.
- 플레이어 ready 전에는 음량/seek 명령을 무시한다(ready 플래그 추적).
- 영상 ID 추출 순수 함수 `toYoutubeVideoId(url)` 를 utils/youtube.ts 에
  추가(기존 embed 파싱 로직 재사용).

### 단축키

워크아웃 화면(모든 모드 공통, 영상은 항상 보임)에서 동작한다.
기존 `s`(세트 완료) 단축키 effect 패턴을 따른다. 입력 필드
(INPUT/TEXTAREA/SELECT)에서는 무시하고, 처리한 키는 `preventDefault`.

- `f` / `F`: 앱 전체화면 토글(기존 stage requestFullscreen 재사용).
- `ArrowUp` / `ArrowDown`: 영상 음량 ±5 (0~100 클램프).
- `ArrowLeft` / `ArrowRight`: 5초 뒤/앞 seek.

`keyboardShortcutEnabled` 설정이 켜져 있을 때만 등록한다.

### 순수 계산(단위 테스트 대상)

- `clampVolume`(기존) 재사용 — 음량 ±5 후 클램프.
- `seekTarget(current, delta, duration)`: `current + delta` 를
  `[0, duration]` 로 클램프.

## 테스트

- 단위(vitest): `formatRemainingSeconds`, 카운트 증가 규칙(가능하면
  순수화), `clampFloatingPosition`, `seekTarget`, `toYoutubeVideoId`.
- 타입체크 `npx tsc --noEmit`.
- 브라우저 검증:
  - timer 모드 남은시간 초 표시, 플로팅 8칸 순서, 카운트 증가/초기화.
  - 전체화면 진입→드래그→해제 후 플로팅이 stage 안에 보이는지.
  - (5번) F 전체화면, 방향키 음량/seek 동작. 만족도 판단.
