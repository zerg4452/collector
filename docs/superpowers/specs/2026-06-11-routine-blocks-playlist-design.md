# 운동 컴패니언 구조 개편 설계: 복합세트 · 블록 루틴 · 유튜브 플레이리스트

날짜: 2026-06-11
상태: 승인됨 (브레인스토밍 세션에서 사용자 확인 완료)

## 배경과 목표

현재 앱은 운동을 "무게 × 횟수 × 세트 수" 단일 형태로만 등록할 수 있고, 루틴은 요일별 운동의 평면 목록이다. 다음 세 가지를 지원하도록 구조를 개편한다.

1. **복합세트(클러스터) 타입** — 한 운동 안에서 세트 구성을 구간별로 다르게 정의한다.
   예: 바벨 컬 1~3세트는 일반(25kg × 12회), 4~5세트는 복합(10 + 8 + 6회, 중간휴식 5초).
2. **3뎁스 루틴 구조** — 루틴 → 운동세트 블록 → 블록 안 여러 운동종목.
   예: 라잉 트라이셉스 익스텐션 → (휴식 없이) V업 → 30초 휴식 → 다음 라운드.
3. **유튜브 플레이리스트** — 이름 붙인 영상 목록을 여러 개 만들어 두고, 운동 중 "다음" 버튼으로 순서대로 재생한다.

## 핵심 결정 사항

| 결정 | 선택 | 비고 |
|---|---|---|
| 복합세트 입력 방식 | 구간(세그먼트) 방식 | 같은 설정의 세트를 묶어 한 번에 입력 |
| 복합세트 진행 중 처리 | 안내 표시만 | 5초 중간휴식은 사용자가 직접 셈. 타이머 개입 없음 |
| 휴식 카운트 단위 | 세트(라운드) 단위 | 기존 의도 유지 |
| 블록 내 종목 간 휴식 | 없음 (즉시 수행) | 휴식은 라운드 종료 시에만 |
| 라운드 수 / 라운드 휴식 | 블록 레벨에서 지정 | 단독 블록은 운동 등록값에서 자동 파생 |
| 데이터 모델 | 통일 블록 모델 | 단독 운동도 1종목 블록. 진행 엔진은 블록만 이해 |
| 플레이리스트 구조 | 이름 붙인 목록 여러 개 | 운동 중 드롭다운으로 선택 |
| 영상 넘김 | 수동 ("다음" 버튼) | 자동 재생(IFrame API) 도입 안 함 |

## 데이터 모델 (v2)

```ts
// 운동 등록 — 구간(세그먼트) 배열
type SetSegment = {
  id: string;
  type: "normal" | "cluster";
  sets: number;              // 이 구간의 세트 수
  weight: string;
  reps: number;              // normal: 세트당 횟수
  clusterReps: number[];     // cluster: 예 [10, 8, 6]
  intraRestSeconds: number;  // cluster: 중간휴식(초). 안내 표시 전용
};

type ExerciseItem = {
  id: string;
  name: string;
  segments: SetSegment[];    // 예: [일반×3, 클러스터×2]
  restSeconds: number;       // 세트(라운드) 간 휴식
  createdAt: string;
  updatedAt: string;
};

// 루틴 — 요일마다 블록 배열
type BlockExerciseSnapshot = {
  id: string;
  sourceExerciseId: string;
  name: string;
  segments: SetSegment[];    // 등록 시점 스냅샷
  order: number;
};

type RoutineBlock = {
  id: string;
  exercises: BlockExerciseSnapshot[]; // 길이 1 = 단독 운동
  rounds: number;            // 단독 블록: 종목 세그먼트 세트 합계로 자동 설정
  restSeconds: number;       // 라운드 간 휴식
  order: number;
};

type RoutinePreset = {
  id: string;
  name: string;
  isActive: boolean;
  days: Record<Weekday, RoutineBlock[]>;
  createdAt: string;
  updatedAt: string;
};

// 유튜브 플레이리스트
type YoutubePlaylistItem = {
  id: string;
  url: string;
  label: string;             // oEmbed로 가져온 제목, 실패 시 URL
};

type YoutubePlaylist = {
  id: string;
  name: string;
  items: YoutubePlaylistItem[];
  createdAt: string;
  updatedAt: string;
};

// AppData에 playlists: YoutubePlaylist[], version: 2 추가
```

### 라운드 → 세트 처방 매핑 규칙

블록의 r번째 라운드에서 각 종목은 자기 세그먼트를 펼친(flatten) r번째 세트 처방을 사용한다. 등록된 세트 수보다 라운드가 많으면 마지막 처방을 반복한다.

예: 바벨 컬 단독 블록(라운드 5) → 라운드 1~3: 일반 25kg×12, 라운드 4~5: 클러스터 10+8+6.

## 운동 진행 엔진

```ts
type WorkoutSessionState = {
  blockIndex: number;          // 현재 블록
  round: number;               // 현재 라운드 (1부터)
  exerciseIndex: number;       // 블록 안 현재 종목
  phase: "ready" | "rest" | "complete";
  remainingRestSeconds: number;
};
```

"세트 완료" 클릭 = 현재 종목의 현재 라운드 수행 완료. 진행 규칙:

1. 블록에 다음 종목이 남음 → 휴식 없이 즉시 다음 종목 (`ready` 유지)
2. 블록 마지막 종목이고 라운드 남음 → `rest`(블록 라운드 휴식) → 휴식 종료 시 라운드+1, 첫 종목부터
3. 마지막 라운드이고 다음 블록 있음 → `rest`(현재 블록 휴식) → 다음 블록 라운드 1, 첫 종목
4. 마지막 블록·마지막 라운드·마지막 종목 → `complete`, 당일 완료 기록

"되돌리기"는 위 규칙의 역방향으로 블록/라운드/종목 단위 이동.

기존 `advanceSet` / `finishRest`는 블록 기반으로 재작성한다.

## UI 설계

### 운동 등록 화면 (구간 방식)

- 운동 이름 + 구간 카드 목록 + "구간 추가" 버튼 + 공통 세트 간 휴식 입력
- 구간 카드: 타입(일반/복합) 선택, 세트 수, 일반이면 무게·횟수, 복합이면 횟수 패턴("10+8+6" 텍스트 입력 후 파싱)·중간휴식 초

### 루틴 편집 화면 (요일별)

- 블록 목록. 단독 블록은 한 줄 카드(블록 개념 숨김, 세트 요약 표시), 묶음 블록은 종목 목록·라운드 수·라운드 휴식이 보이는 카드
- 묶음 블록 카드의 종목 사이에 "휴식 없이 바로" 표시
- "+ 운동 추가": 등록 운동 선택 → 단독 블록 생성(라운드·휴식 자동)
- "+ 묶음 블록 추가": 등록 운동 여러 개 선택 + 순서 + 라운드 수 + 라운드 휴식 입력
- 드래그로 블록 순서 변경, 블록 수정 화면에서 종목 순서 변경

### 운동 중 화면

- 유튜브 툴바: URL 입력칸 제거 → 플레이리스트 드롭다운 + 이전/다음 버튼 + "n/총 · 영상 제목" 표시. 외부 열기·앱 전체화면 버튼은 유지
- 플로팅 컨트롤 확장:
  - "라운드 r/총" 표시
  - 현재 처방 표시 — 일반: "25kg × 12회", 클러스터: "10 + 8 + 6회 · 중간휴식 5초" (안내 전용)
  - 묶음 블록이면 "다음: V업 15회 (휴식 없이 바로)" 미리보기
  - 영상 "다음" 버튼 추가 (전체화면에서도 넘김 가능)

### 플레이리스트 관리 탭 (신규)

- 좌측: 플레이리스트 목록 + 새로 만들기 / 이름 변경 / 삭제
- 우측: 선택한 목록의 영상들 — URL 붙여넣기로 추가, 드래그 정렬, 삭제
- 제목은 추가 시 유튜브 oEmbed(`https://www.youtube.com/oembed?url=...&format=json`)로 자동 취득, 실패하면 URL 표시

## 마이그레이션

- `AppData`에 `version` 필드 추가. 필드 없으면 v1으로 간주
- 로드 시 v1 → v2 자동 변환:
  - `ExerciseItem`(weight/targetReps/sets) → `segments: [일반 세그먼트 1개]`
  - 루틴의 `RoutineExerciseSnapshot` → 1종목 `RoutineBlock` (rounds = 기존 sets, restSeconds = 기존 restSeconds)
  - `playlists: []` 초기화
- 완료 기록·설정은 그대로 유지. 저장 시 v2 형식으로 기록

## 예외 처리

- 빈 블록(종목 0개)은 저장 불가, 진행 시 건너뜀
- 클러스터 횟수 텍스트("10+8+6") 파싱 — 숫자 아닌 입력 거부
- 라운드 수 > 등록 세트 수 → 마지막 세트 처방 반복
- 플레이리스트 제목 취득 실패(오프라인 등) → URL 표시, 나머지 기능 정상 동작
- 플레이리스트 끝에서 "다음" → 첫 영상으로 순환

## 테스트 계획

- `src/domain/workout.test.ts` 재작성:
  - 블록 진행: 종목 간 무휴식 이동, 라운드 휴식, 블록 전환, 완료 판정, 되돌리기
  - 라운드 → 세트 처방 매핑 (혼합 세그먼트, 라운드 초과 시 마지막 처방 반복)
  - v1 → v2 마이그레이션 (운동/루틴/기록 보존)
- `src/utils/youtube.test.ts` 확장: 플레이리스트 순환(다음/이전, 끝↔처음)
