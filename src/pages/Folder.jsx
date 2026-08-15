import { useMemo, useState } from "react";
import {
  Link,
  useParams,
} from "react-router-dom";

import {
  getFolders,
  getExams,
  createExam,
  updateExam,
  moveExam,
  deleteExam,
  MAX_QUESTIONS,
} from "../services/dataService";

function Folder() {
  const { id } = useParams();

  const [dataVersion, setDataVersion] =
    useState(0);

  const [showModal, setShowModal] =
    useState(false);

  const [editingExam, setEditingExam] =
    useState(null);

  const [examName, setExamName] =
    useState("");

  const [questionCount, setQuestionCount] =
    useState("");

  const [
    customNumbering,
    setCustomNumbering,
  ] = useState(false);

  const [startNumber, setStartNumber] =
    useState("1");

  const [endNumber, setEndNumber] =
    useState("");

  const [useStep, setUseStep] =
    useState(false);

  const [step, setStep] =
    useState("1");

  const [
    negativeMarking,
    setNegativeMarking,
  ] = useState(true);

  const folders = useMemo(() => {
    return getFolders();
  }, [dataVersion]);

  const folder = useMemo(() => {
    return (
      folders.find(
        (item) =>
          String(item.id) ===
          String(id)
      ) || null
    );
  }, [folders, id]);

  const exams = useMemo(() => {
    const allExams =
      getExams();

    return allExams.filter(
      (exam) =>
        String(exam.folderId) ===
        String(id)
    );
  }, [id, dataVersion]);

  function refreshData() {
    setDataVersion(
      (value) => value + 1
    );
  }

  function resetForm() {
    setExamName("");
    setQuestionCount("");
    setCustomNumbering(false);
    setStartNumber("1");
    setEndNumber("");
    setUseStep(false);
    setStep("1");
    setNegativeMarking(true);
  }

  function openCreateModal() {
    setEditingExam(null);
    resetForm();
    setShowModal(true);
  }

  function openEditModal(exam) {
    setEditingExam(exam);

    setExamName(exam.name);
    setQuestionCount(
      exam.questionCount
    );

    setCustomNumbering(
      exam.customNumbering || false
    );

    setStartNumber(
      exam.startNumber ?? "1"
    );

    setEndNumber(
      exam.endNumber ?? ""
    );

    setUseStep(
      exam.useStep || false
    );

    setStep(
      exam.step ?? "1"
    );

    setNegativeMarking(
      exam.negativeMarking ?? true
    );

    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingExam(null);
    resetForm();
  }

  function saveExamForm() {
    const name =
      examName.trim();

    if (!name) {
      alert(
        "اسم آزمون را وارد کن."
      );
      return;
    }

    let count;

    if (customNumbering) {
      const start =
        Number(startNumber);

      const end =
        Number(endNumber);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end)
      ) {
        alert(
          "شماره شروع و پایان باید عدد صحیح باشند."
        );
        return;
      }

      if (end < start) {
        alert(
          "شماره پایان نمی‌تواند از شماره شروع کمتر باشد."
        );
        return;
      }

      const currentStep =
        useStep
          ? Number(step)
          : 1;

      if (
        !Number.isInteger(
          currentStep
        ) ||
        currentStep < 1
      ) {
        alert(
          "ضریب شماره‌گذاری باید حداقل ۱ باشد."
        );
        return;
      }

      count =
        Math.floor(
          (end - start) /
            currentStep
        ) + 1;
    } else {
      count =
        Number(
          questionCount
        );

      if (
        !Number.isInteger(count) ||
        count < 1
      ) {
        alert(
          "تعداد تست باید حداقل ۱ باشد."
        );
        return;
      }
    }

    if (
      count >
      MAX_QUESTIONS
    ) {
      alert(
        `تعداد تست نمی‌تواند بیشتر از ${MAX_QUESTIONS} باشد.`
      );
      return;
    }

    if (editingExam) {
      const updated =
        updateExam(
          editingExam.id,
          {
            folderId:
              editingExam.folderId,

            name,

            questionCount:
              count,

            customNumbering,

            startNumber:
              customNumbering
                ? Number(
                    startNumber
                  )
                : 1,

            endNumber:
              customNumbering
                ? Number(
                    endNumber
                  )
                : count,

            useStep:
              customNumbering
                ? useStep
                : false,

            step:
              customNumbering &&
              useStep
                ? Number(step)
                : 1,

            negativeMarking,
          }
        );

      if (!updated) {
        alert(
          "ذخیره تغییرات آزمون انجام نشد."
        );
        return;
      }
    } else {
      const newExam = {
        id: Date.now(),

        folderId:
          Number(id),

        name,

        questionCount:
          count,

        customNumbering,

        startNumber:
          customNumbering
            ? Number(
                startNumber
              )
            : 1,

        endNumber:
          customNumbering
            ? Number(
                endNumber
              )
            : count,

        useStep:
          customNumbering
            ? useStep
            : false,

        step:
          customNumbering &&
          useStep
            ? Number(step)
            : 1,

        negativeMarking,

        createdAt:
          new Date().toISOString(),
      };

      const created =
        createExam(
          newExam
        );

      if (!created) {
        alert(
          "ساخت آزمون انجام نشد."
        );
        return;
      }
    }

    refreshData();
    closeModal();
  }

  function handleDeleteExam(exam) {
    const confirmed =
      window.confirm(
        `آزمون «${exam.name}» حذف شود؟`
      );

    if (!confirmed) {
      return;
    }

    const deleted =
      deleteExam(
        exam.id
      );

    if (!deleted) {
      alert(
        "حذف آزمون انجام نشد."
      );
      return;
    }

    refreshData();
  }

  function handleMoveExam(exam) {
    const otherFolders =
      folders.filter(
        (item) =>
          String(item.id) !==
          String(id)
      );

    if (
      otherFolders.length === 0
    ) {
      alert(
        "فولدر دیگری برای انتقال وجود ندارد."
      );
      return;
    }

    const choices =
      otherFolders
        .map(
          (folder, index) =>
            `${index + 1}. ${folder.name}`
        )
        .join("\n");

    const answer =
      prompt(
        `آزمون را به کدام فولدر منتقل کنیم؟\n\n${choices}\n\nشماره فولدر را وارد کن:`
      );

    if (!answer) {
      return;
    }

    const index =
      Number(answer) - 1;

    if (
      index < 0 ||
      index >=
        otherFolders.length
    ) {
      alert(
        "شماره وارد شده معتبر نیست."
      );
      return;
    }

    const targetFolder =
      otherFolders[index];

    const moved =
      moveExam(
        exam.id,
        targetFolder.id
      );

    if (!moved) {
      alert(
        "انتقال آزمون انجام نشد."
      );
      return;
    }

    refreshData();
  }

  if (!folder) {
    return (
      <section className="page-section">

        <div className="empty-state">

          <div className="empty-icon">
            📁
          </div>

          <h3>
            فولدر پیدا نشد
          </h3>

          <p>
            این فولدر وجود ندارد یا حذف شده است.
          </p>

          <Link
            to="/folders"
            className="primary-button"
          >
            ← بازگشت به فولدرها
          </Link>

        </div>

      </section>
    );
  }

  return (
    <section className="page-section folder-page">

      <div className="folder-page-header">

        <div className="folder-page-title">

          <Link
            to="/folders"
            className="back-link"
          >
            ← فولدرها
          </Link>

          <div className="folder-heading-row">

            <div className="folder-heading-icon">
              📁
            </div>

            <div>
              <h1>
                {folder.name}
              </h1>

              <p>
                {exams.length} آزمون
              </p>
            </div>

          </div>

        </div>

        <button
          className="primary-button"
          onClick={
            openCreateModal
          }
        >
          <span>＋</span>
          آزمون جدید
        </button>

      </div>

      {exams.length === 0 ? (

        <div className="empty-state folder-empty-state">

          <div className="empty-icon">
            📝
          </div>

          <h3>
            هنوز آزمونی در این فولدر نیست
          </h3>

          <p>
            اولین آزمون را بساز و پاسخ‌برگش را شروع کن.
          </p>

          <button
            className="primary-button"
            onClick={
              openCreateModal
            }
          >
            <span>＋</span>
            ساخت آزمون
          </button>

        </div>

      ) : (

        <div className="exam-list">

          {exams.map((exam) => (

            <div
              key={exam.id}
              className="exam-list-card"
            >

              <Link
                to={`/exam/${exam.id}`}
                className="exam-list-main"
              >

                <div className="exam-list-icon">
                  📝
                </div>

                <div className="exam-list-info">

                  <h3>
                    {exam.name}
                  </h3>

                  <div className="exam-list-meta">

                    <span>
                      {exam.questionCount} تست
                    </span>

                    {exam.customNumbering && (
                      <>
                        <span className="meta-dot">
                          •
                        </span>

                        <span>
                          شماره‌گذاری سفارشی
                        </span>
                      </>
                    )}

                    {exam.negativeMarking && (
                      <>
                        <span className="meta-dot">
                          •
                        </span>

                        <span>
                          نمره منفی
                        </span>
                      </>
                    )}

                  </div>

                </div>

                <span className="exam-list-arrow">
                  ←
                </span>

              </Link>

              <div className="exam-actions">

                <button
                  type="button"
                  title="ویرایش"
                  aria-label="ویرایش آزمون"
                  onClick={() =>
                    openEditModal(
                      exam
                    )
                  }
                >
                  ✏️
                </button>

                <button
                  type="button"
                  title="انتقال"
                  aria-label="انتقال آزمون"
                  onClick={() =>
                    handleMoveExam(
                      exam
                    )
                  }
                >
                  📁
                </button>

                <button
                  type="button"
                  title="حذف"
                  aria-label="حذف آزمون"
                  onClick={() =>
                    handleDeleteExam(
                      exam
                    )
                  }
                >
                  🗑️
                </button>

              </div>

            </div>

          ))}

        </div>

      )}

      {showModal && (

        <div
          className="modal-overlay"
          onClick={
            closeModal
          }
        >

          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>
                <h2>
                  {editingExam
                    ? "ویرایش آزمون"
                    : "ساخت آزمون جدید"}
                </h2>

                <p>
                  {editingExam
                    ? "مشخصات آزمون را ویرایش کنید."
                    : "مشخصات آزمون جدید را وارد کنید."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeModal
                }
                aria-label="بستن"
              >
                ×
              </button>

            </div>

            <div className="modal-form">

              <label>
                نام آزمون
              </label>

              <input
                value={examName}
                onChange={(event) =>
                  setExamName(
                    event.target.value
                  )
                }
                placeholder="مثلاً آزمون فیزیک"
                autoFocus
              />

              {!customNumbering && (
                <>
                  <label>
                    تعداد تست
                  </label>

                  <input
                    type="number"
                    min="1"
                    max={
                      MAX_QUESTIONS
                    }
                    value={
                      questionCount
                    }
                    onChange={(
                      event
                    ) =>
                      setQuestionCount(
                        event.target
                          .value
                      )
                    }
                    placeholder="مثلاً 50"
                  />
                </>
              )}

              <label className="checkbox-row">

                <input
                  type="checkbox"
                  checked={
                    customNumbering
                  }
                  onChange={(
                    event
                  ) =>
                    setCustomNumbering(
                      event.target
                        .checked
                    )
                  }
                />

                <span>
                  شماره‌گذاری سفارشی
                </span>

              </label>

              {customNumbering && (

                <div className="numbering-options">

                  <div className="number-inputs">

                    <div>

                      <label>
                        شروع
                      </label>

                      <input
                        type="number"
                        value={
                          startNumber
                        }
                        onChange={(
                          event
                        ) =>
                          setStartNumber(
                            event.target
                              .value
                          )
                        }
                      />

                    </div>

                    <div>

                      <label>
                        پایان
                      </label>

                      <input
                        type="number"
                        value={
                          endNumber
                        }
                        onChange={(
                          event
                        ) =>
                          setEndNumber(
                            event.target
                              .value
                          )
                        }
                      />

                    </div>

                  </div>

                  <label className="checkbox-row">

                    <input
                      type="checkbox"
                      checked={
                        useStep
                      }
                      onChange={(
                        event
                      ) =>
                        setUseStep(
                          event.target
                            .checked
                        )
                      }
                    />

                    <span>
                      ضریب شماره‌گذاری
                    </span>

                  </label>

                  {useStep && (
                    <input
                      type="number"
                      min="1"
                      value={
                        step
                      }
                      onChange={(
                        event
                      ) =>
                        setStep(
                          event.target
                            .value
                        )
                      }
                      placeholder="مثلاً 2"
                    />
                  )}

                  {startNumber &&
                    endNumber &&
                    Number(
                      endNumber
                    ) >=
                      Number(
                        startNumber
                      ) && (

                    <div className="numbering-preview">

                      {(() => {
                        const start =
                          Number(
                            startNumber
                          );

                        const end =
                          Number(
                            endNumber
                          );

                        const currentStep =
                          useStep
                            ? Number(
                                step
                              ) || 1
                            : 1;

                        const numbers =
                          [];

                        for (
                          let n =
                            start;
                          n <= end &&
                          numbers.length <
                            12;
                          n +=
                            currentStep
                        ) {
                          numbers.push(
                            n
                          );
                        }

                        const hasMore =
                          numbers.length ===
                            12 &&
                          start +
                            currentStep *
                              numbers.length <=
                            end;

                        return (
                          <>
                            <span>
                              پیش‌نمایش
                            </span>

                            <strong>
                              {numbers.join(
                                "  •  "
                              )}

                              {hasMore &&
                                "  ..."}
                            </strong>
                          </>
                        );
                      })()}

                    </div>
                  )}

                </div>
              )}

              <div className="exam-setting-row">

                <div className="exam-setting-info">

                  <strong>
                    نمره منفی
                  </strong>

                  <span>
                    هر ۳ پاسخ غلط، یک پاسخ درست را خنثی می‌کند.
                  </span>

                </div>

                <button
                  type="button"
                  className={`toggle-switch ${
                    negativeMarking
                      ? "active"
                      : ""
                  }`}
                  role="switch"
                  aria-checked={
                    negativeMarking
                  }
                  onClick={() =>
                    setNegativeMarking(
                      (value) =>
                        !value
                    )
                  }
                >

                  <span className="toggle-knob" />

                </button>

              </div>

            </div>

            <div className="modal-buttons">

              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeModal
                }
              >
                لغو
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  saveExamForm
                }
              >
                {editingExam
                  ? "ذخیره تغییرات"
                  : "ساخت آزمون"}
              </button>

            </div>

          </div>

        </div>

      )}

    </section>
  );
}

export default Folder;