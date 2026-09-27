import { useMemo } from "react";
import Modal from "../ui/Modal";
import { useTranslation } from "../../i18n";
import { buildPageList } from "../../services/examNav";

// Pages navigator: a scrollable grid of page cards for large exams.
// Delegates every jump to the exam's existing onJump (jumpToQuestion),
// so page/question state stays synchronized with the current exam —
// no parallel navigation system. Only page metadata is rendered (one
// card per ~100 questions), so a 5000-question exam shows 50 cards.
export default function PagesNavigator({
  open,
  onClose,
  questionNumbers,
  currentPage,
  onJump,
}) {
  const { t } = useTranslation();

  const pages = useMemo(
    () => buildPageList(questionNumbers),
    [questionNumbers]
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("exam.pages.title")}
      subtitle={t("exam.pages.hint")}
      size="lg"
    >
      {pages.length === 0 ? (
        <div className="navigator-empty">
          <p>{t("exam.pages.empty")}</p>
        </div>
      ) : (
        <div className="pages-grid">
          {pages.map((entry) => {
            const isCurrent = entry.page === currentPage;
            return (
              <button
                key={entry.page}
                type="button"
                className={`page-card${isCurrent ? " is-current" : ""}`}
                onClick={() => onJump(entry.from)}
                aria-current={isCurrent ? "page" : undefined}
                aria-label={t("exam.pages.go", {
                  page: entry.page,
                  from: entry.from,
                  to: entry.to,
                })}
              >
                <span className="page-card-num">
                  {t("exam.pages.page")} {entry.page}
                </span>
                <span className="page-card-range">
                  {t("exam.pages.range", { from: entry.from, to: entry.to })}
                </span>
                {isCurrent && (
                  <span className="page-card-current">
                    {t("exam.pages.current")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
