// 운동 진행 화면. 블록 기반 진행 상태와 유튜브 플레이리스트를 보여준다.
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Grip,
  Maximize2,
  Minimize2,
  MousePointerClick,
  RotateCcw,
  SkipBack,
  SkipForward
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  RoutineBlock,
  RoutineMode,
  Weekday,
  WorkoutSessionState,
  YoutubePlaylist
} from "../types";
import {
  describePrescription,
  describeSegments,
  formatSeconds,
  prescriptionForRound,
  weekdayLabels
} from "../domain/workout";

type WorkoutViewProps = {
  playlists: YoutubePlaylist[];
  selectedPlaylistId: string;
  onSelectPlaylist: (playlistId: string) => void;
  videoIndex: number;
  onNextVideo: () => void;
  onPreviousVideo: () => void;
  embedUrl: string;
  routineName: string;
  weekday: Weekday;
  blocks: RoutineBlock[];
  session: WorkoutSessionState;
  settings: AppSettings;
  restAlert: boolean;
  hasCompletion: boolean;
  onSetComplete: () => void;
  onUndo: () => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  canUndo: boolean;
  mode: RoutineMode;
  timerRemaining: number;
  timerDuration: number | null;
  onTimer: (seconds: number) => void;
};

function WorkoutView({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  videoIndex,
  onNextVideo,
  onPreviousVideo,
  embedUrl,
  routineName,
  weekday,
  blocks,
  session,
  settings,
  restAlert,
  hasCompletion,
  onSetComplete,
  onUndo,
  onDragStart,
  canUndo,
  mode,
  timerRemaining,
  timerDuration,
  onTimer
}: WorkoutViewProps) {
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsStageFullscreen(document.fullscreenElement === videoStageRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleToggleStageFullscreen = async () => {
    if (document.fullscreenElement === videoStageRef.current) {
      await document.exitFullscreen();
      return;
    }

    await videoStageRef.current?.requestFullscreen();
  };

  const playlist = playlists.find((item) => item.id === selectedPlaylistId) ?? null;
  const currentVideo = playlist?.items[videoIndex] ?? null;
  const hasVideos = Boolean(playlist && playlist.items.length > 0);

  const block = blocks[session.blockIndex] ?? null;
  const exercise = block?.exercises[session.exerciseIndex] ?? null;
  const prescription = exercise ? prescriptionForRound(exercise.segments, session.round) : null;
  const nextExercise =
    block && session.exerciseIndex < block.exercises.length - 1
      ? block.exercises[session.exerciseIndex + 1]
      : null;
  const nextPrescription = nextExercise
    ? prescriptionForRound(nextExercise.segments, session.round)
    : null;
  const canCompleteSet = Boolean(exercise) && session.phase === "ready";

  return (
    <section className="screen workout-screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{weekdayLabels[weekday]}요일</p>
          <h2>
            {mode === "timer"
              ? "타이머"
              : mode === "off"
                ? "운동"
                : routineName || "활성 루틴 없음"}
          </h2>
        </div>
        {hasCompletion && (
          <span className="status-pill done">
            <CheckCircle2 size={16} aria-hidden="true" />
            완료
          </span>
        )}
      </div>

      <div className="youtube-toolbar">
        <select
          aria-label="플레이리스트 선택"
          value={selectedPlaylistId}
          onChange={(event) => onSelectPlaylist(event.target.value)}
        >
          <option value="">플레이리스트 선택</option>
          {playlists.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.items.length}개)
            </option>
          ))}
        </select>
        <button
          className="icon-link"
          type="button"
          onClick={onPreviousVideo}
          disabled={!hasVideos}
          title="이전 영상"
        >
          <SkipBack size={17} aria-hidden="true" />
          이전
        </button>
        <span className="video-meta">
          {currentVideo && playlist
            ? `${videoIndex + 1}/${playlist.items.length} · ${currentVideo.label}`
            : "영상 없음"}
        </span>
        <button
          className="icon-link"
          type="button"
          onClick={onNextVideo}
          disabled={!hasVideos}
          title="다음 영상"
        >
          다음
          <SkipForward size={17} aria-hidden="true" />
        </button>
        {currentVideo && (
          <a className="icon-link" href={currentVideo.url} target="_blank" rel="noreferrer">
            <ExternalLink size={17} aria-hidden="true" />
            외부 열기
          </a>
        )}
        <button
          className="icon-link"
          type="button"
          onClick={() => void handleToggleStageFullscreen()}
          title="앱 전체화면"
        >
          {isStageFullscreen ? (
            <Minimize2 size={17} aria-hidden="true" />
          ) : (
            <Maximize2 size={17} aria-hidden="true" />
          )}
          {isStageFullscreen ? "전체화면 종료" : "앱 전체화면"}
        </button>
      </div>

      <div
        ref={videoStageRef}
        className={`video-stage ${restAlert ? "rest-finished" : ""}`}
      >
        {embedUrl ? (
          <iframe
            title="YouTube player"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="video-placeholder">
            <Activity size={48} aria-hidden="true" />
            <span>YouTube</span>
          </div>
        )}

        <div
          className={`floating-control floating-control--${mode}`}
          style={{
            transform: `translate(${settings.floatingControlPosition.x}px, ${settings.floatingControlPosition.y}px)`
          }}
        >
          <button
            className="drag-handle"
            type="button"
            onPointerDown={onDragStart}
            title="위치 이동"
          >
            <Grip size={18} aria-hidden="true" />
          </button>
          {mode === "routine" && (
            <>
              <div className="floating-main">
                <span className="floating-label">
                  {session.phase === "rest"
                    ? "휴식"
                    : session.phase === "complete"
                      ? "완료"
                      : block
                        ? `진행 · 라운드 ${session.round}/${block.rounds}`
                        : "진행"}
                </span>
                <strong>{exercise?.name ?? "오늘 운동 없음"}</strong>
                <span>
                  {prescription ? describePrescription(prescription) : "루틴을 준비해 주세요"}
                </span>
                {nextExercise && nextPrescription && (
                  <span className="next-hint">
                    다음: {nextExercise.name} {describePrescription(nextPrescription)} (휴식 없이 바로)
                  </span>
                )}
              </div>
              <div className="timer-box">
                {session.phase === "rest" ? formatSeconds(session.remainingRestSeconds) : "--:--"}
              </div>
              <button
                className="primary-action"
                type="button"
                onClick={onSetComplete}
                disabled={!canCompleteSet}
                title="세트 완료"
              >
                <MousePointerClick size={18} aria-hidden="true" />
                세트 완료
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="되돌리기"
              >
                <RotateCcw size={18} aria-hidden="true" />
              </button>
            </>
          )}

          {mode === "timer" && (
            <>
              <button
                className={`primary-action ${timerDuration === 30 ? "active" : ""}`}
                type="button"
                onClick={() => onTimer(30)}
                title="30초 타이머"
              >
                30초
              </button>
              <button
                className={`primary-action ${timerDuration === 60 ? "active" : ""}`}
                type="button"
                onClick={() => onTimer(60)}
                title="60초 타이머"
              >
                60초
              </button>
              <div className="timer-box">
                {timerRemaining > 0 ? formatSeconds(timerRemaining) : "--:--"}
              </div>
            </>
          )}
          <button
            className="icon-button"
            type="button"
            onClick={onNextVideo}
            disabled={!hasVideos}
            title="다음 영상"
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void handleToggleStageFullscreen()}
            title={isStageFullscreen ? "전체화면 종료" : "앱 전체화면"}
          >
            {isStageFullscreen ? (
              <Minimize2 size={18} aria-hidden="true" />
            ) : (
              <Maximize2 size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {mode === "routine" && (
        <div className="workout-list">
          {blocks.length === 0 ? (
            <p className="empty-state">오늘 루틴 없음</p>
          ) : (
            blocks.map((item, index) => (
              <div
                key={item.id}
                className={`workout-row ${index === session.blockIndex ? "current" : ""}`}
              >
                <span className="order-badge">{index + 1}</span>
                <div>
                  {item.exercises.length === 1 ? (
                    <>
                      <strong>{item.exercises[0].name}</strong>
                      <span>
                        {describeSegments(item.exercises[0].segments)} · {item.rounds}세트 · 휴식{" "}
                        {formatSeconds(item.restSeconds)}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>
                        묶음 · {item.exercises.map((entry) => entry.name).join(" → ")}
                      </strong>
                      <span>
                        {item.rounds}라운드 · 라운드 휴식 {formatSeconds(item.restSeconds)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}

export default WorkoutView;
