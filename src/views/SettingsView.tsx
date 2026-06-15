// 알람과 입력 설정을 관리한다.
import { Volume2 } from "lucide-react";
import type { AppSettings } from "../types";
import { clampVolume } from "../domain/workout";

function SettingsView({
  settings,
  onChange
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}) {
  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2>설정</h2>
        </div>
      </div>

      <div className="panel settings-panel">
        <label className="range-row">
          <span>
            <Volume2 size={18} aria-hidden="true" />
            알람 볼륨
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.alarmVolume}
            onChange={(event) =>
              onChange({ ...settings, alarmVolume: clampVolume(Number(event.target.value)) })
            }
          />
          <strong>{settings.alarmVolume}</strong>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.restEndSoundEnabled}
            onChange={(event) =>
              onChange({ ...settings, restEndSoundEnabled: event.target.checked })
            }
          />
          휴식 종료 소리
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.restEndVisualAlertEnabled}
            onChange={(event) =>
              onChange({ ...settings, restEndVisualAlertEnabled: event.target.checked })
            }
          />
          휴식 종료 화면 강조
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.keyboardShortcutEnabled}
            onChange={(event) =>
              onChange({ ...settings, keyboardShortcutEnabled: event.target.checked })
            }
          />
          단축키 보조 입력
        </label>

        <fieldset className="radio-group">
          <legend>운동 루틴 모드</legend>
          {([
            { value: "off", label: "끄기" },
            { value: "routine", label: "운동 루틴" },
            { value: "timer", label: "단순 타이머" }
          ] as const).map((option) => (
            <label key={option.value} className="radio-row">
              <input
                type="radio"
                name="routineMode"
                value={option.value}
                checked={settings.routineMode === option.value}
                onChange={() =>
                  onChange({ ...settings, routineMode: option.value })
                }
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}

export default SettingsView;
