import { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import { useTranslation } from "../../i18n";

export default function QuestionNavigator({
  open,
  onClose,
  questionNumbers,
  answers,
  unresolved,
  currentQuestion,
  onJump,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");

  const numbers = useMemo(
    () => (Array.isArray(questionNumbers) ? questionNumbers : []),
    [questionNumbers]
  );
  const answerMap = useMemo(() => answers || {}, [answers]);
  const unresolvedList = useMemo(
    () => (Array.isArray(unresolved) ? unresolved.map(Number) : []),
    [unresolved]
  );

  const isUnresolved = (q) => unresolvedList.includes(Number(q));

  const stats = useMemo(() => {
    const answered = numbers.filter((q) => answerMap[q] != null && answerMap[q] !== "").length;
    const unanswered = numbers.length - answered;
    return { answered, unanswered, total: numbers.length };
  }, [numbers, answerMap]);

  const visible = useMemo(() => {
    if (filter === "unanswered") {
      return numbers.filter((q) => answerMap[q] == null || answerMap[q] === "");
    }
    return numbers;
  }, [numbers, answerMap, filter]);

  const chips = [
    { id: "all", label: t("exam.workspace.filterAll"), count: stats.total },
    { id: "unanswered", label: t("exam.workspace.filterUnanswered"), count: stats.unanswered },
  ];

  const pct =
    stats.total > 0
      ? Math.round((stats.answered / stats.total) * 100)
      : 0;

  function handleGridKeyDown(event) {
    const grid = event.currentTarget;
    const cells = Array.from(
      grid.querySelectorAll("button.navigator-cell")
    );
    const index = cells.indexOf(document.activeElement);
    if (index === -1 || cells.length === 0) return;

    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = index + 1;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = index - 1;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = cells.length - 1;
    }

    if (next >= 0 && next < cells.length) {
      event.preventDefault();
      cells[next].focus();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("exam.workspace.navigator")}
      subtitle={t("exam.workspace.navigatorHint")}
      size="lg"
    >
      <div className="navigator-summary">
        <span className="navigator-summary-item">
          <strong>{stats.answered}</strong> {t("exam.workspace.answered")}
        </span>
        <span className="navigator-summary-item">
          <strong>{stats.unanswered}</strong> {t("exam.unanswered")}
        </span>
        <span className="navigator-summary-item navigator-summary-pct">
          <strong>{pct}%</strong> {t("exam.workspace.completion")}
        </span>
        {unresolvedList.length > 0 && (
          <span className="navigator-summary-item navigator-summary-unresolved">
            <strong>{unresolvedList.length}</strong> {t("exam.results.unresolved")}
          </span>
        )}
      </div>

      <div
        className="navigator-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t("exam.workspace.completion")}
      >
        <span
          className="navigator-progress-fill"
          style={{ inlineSize: `${pct}%` }}
          aria-hidden="true"
        />
      </div>

      <div className="navigator-filters" role="tablist" aria-label={t("exam.workspace.navigator")}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            id={`navigator-filter-${chip.id}`}
            type="button"
            role="tab"
            aria-selected={filter === chip.id}
            aria-controls="navigator-grid"
            className={`filter-chip ${filter === chip.id ? "active" : ""}`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
            <span className="filter-chip-count">{chip.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="navigator-empty">
          <Icon name="searchX" size={22} />
          <p>{t("exam.workspace.navigatorEmpty")}</p>
        </div>
      ) : (
        <div
          id="navigator-grid"
          className="navigator-grid"
          role="tabpanel"
          aria-labelledby={`navigator-filter-${filter}`}
          onKeyDown={handleGridKeyDown}
        >
          {visible.map((q) => {
            const isAnswered = answerMap[q] != null && answerMap[q] !== "";
            const unresolvedMarked = isUnresolved(q);
            const isCurrent = Number(currentQuestion) === Number(q);
            const stateLabel = isAnswered
              ? t("exam.workspace.answered")
              : t("exam.unanswered");
            const unresolvedLabel = unresolvedMarked
              ? `، ${t("exam.results.unresolved")}`
              : "";
            return (
              <button
                key={q}
                type="button"
                className={`navigator-cell ${isAnswered ? "is-answered" : ""} ${
                  unresolvedMarked ? "is-unresolved" : ""
                } ${isCurrent ? "is-current" : ""}`}
                onClick={() => onJump(q)}
                aria-label={`${t("exam.answerKey.q")} ${q} — ${stateLabel}${unresolvedLabel}`}
                aria-current={isCurrent ? "true" : undefined}
              >
                <span className="navigator-cell-num">{q}</span>
              </button>
            );
          })}
        </div>
      )}

      <p className="navigator-kbd">{t("exam.workspace.kbdHint")}</p>
    </Modal>
  );
}
