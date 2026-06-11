// 월간 완료 기록 달력을 보여준다.
import { CheckCircle2 } from "lucide-react";
import { toDateKey, weekdayLabels, weekdays } from "../domain/workout";

function CalendarView({ completions }: { completions: Map<string, unknown> }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: startOffset + totalDays }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    return dayNumber > 0 ? dayNumber : null;
  });

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>
            {today.getFullYear()}년 {today.getMonth() + 1}월
          </h2>
        </div>
      </div>

      <div className="calendar-grid weekday-header">
        {weekdays.map((day) => (
          <span key={day}>{weekdayLabels[day]}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) {
            return <div className="calendar-cell empty" key={`empty-${index}`} />;
          }
          const date = new Date(today.getFullYear(), today.getMonth(), day);
          const key = toDateKey(date);
          const done = completions.has(key);
          return (
            <div className={`calendar-cell ${done ? "done" : ""}`} key={key}>
              <span>{day}</span>
              {done && <CheckCircle2 size={18} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default CalendarView;
