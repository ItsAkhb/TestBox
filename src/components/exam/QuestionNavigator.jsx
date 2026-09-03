import { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Icon from "../ui/Icon";
import { useTranslation } from "../../i18n";

export default function QuestionNavigator({
  open,
  onClose,
  questionNumbers,
  answers,
  marked,
  onJump,
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("all");

  const numbers = useMemo(
    () => (Array.isArray(questionNumbers) ? questionNumbers : []),
    [questionNumbers]
  );
  const answerMap = useMemo(() => answers || {}, [answers]);
  const markedList = useMemo(
    () => (Array.isArray(marked) ? marked : []),
    [marked]
  );

  const stats = useMemo(() => {
    const answered = numbers.filter((q) => answerMap[q] != null && answerMap[q] !== "").length;
    const unanswered = numbers.length - answered;
    return { answered, unanswered, marked: markedList.length, total: numbers.length };
  }, [numbers, answerMap, markedList]);

  const visible = useMemo(() => {
    if (filter === "unanswered") {
      return numbers.filter((q) => answerMap[q] == null || answerMap[q] === "");
    }
    if (filter === "marked") {
      return numbers.filter((q) => markedList.includes(q));
    }
    return numbers;
  }, [numbers, answerMap, markedList, filter]);

  const chips = [
    { id: "all", label: t("exam.workspace.filterAll"), count: stats.total },
    { id: "unanswered", label: t("exam.workspace.filterUnanswered"), count: stats.unanswered },
    { id: "marked", label: t("exam.workspace.filterMarked"), count: stats.marked },
  ];

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
        <span className="navigator-summary-item">
          <strong>{stats.marked}</strong> {t("exam.markedCount")}
        </span>
      </div>

      <div className="navigator-filters" role="tablist" aria-label={t("exam.workspace.navigator")}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={filter === chip.id}
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
        <div className="navigator-grid">
          {visible.map((q) => {
            const isAnswered = answerMap[q] != null && answerMap[q] !== "";
            const isMarked = markedList.includes(q);
            return (
              <button
                key={q}
                type="button"
                className={`navigator-cell ${isAnswered ? "is-answered" : ""} ${isMarked ? "is-marked" : ""}`}
                onClick={() => onJump(q)}
                aria-label={`${t("exam.answerKey.q")} ${q}`}
              >
                <span className="navigator-cell-num">{q}</span>
                {isMarked && (
                  <span className="navigator-cell-flag" aria-hidden="true">
                    <Icon name="bookmark" size={10} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="navigator-kbd">{t("exam.workspace.kbdHint")}</p>
    </Modal>
  );
}
