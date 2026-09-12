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
  getExamDataKey,
  MAX_QUESTIONS,
generateId,} from "../services/dataService";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import { computeFormQuestionNumbers } from "../services/scoring";
import Icon from "../components/ui/Icon";
import Modal from "../components/ui/Modal";

const ANSWER_OPTIONS = ["1", "2", "3", "4"];
const QUESTIONS_PER_PAGE = 50;

function AnswerKeyGrid({ questionCount, customNumbering, startNumber, useStep, step, answerKeyData, setAnswerKeyData }) {
  const { t } = useTranslation();
  const [akPage, setAkPage] = useState(1);

  // Build question numbers array
  const questionNumbers = useMemo(() => {
    const count = Number(questionCount) || 0;
    if (count < 1) return [];
    if (customNumbering) {
      const start = Number(startNumber);
      const s = useStep ? Number(step) : 1;
      if (!Number.isInteger(start) || !Number.isInteger(s) || s < 1) return [];
      return Array.from({ length: count }, (_, i) => start + i * s);
    }
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [questionCount, customNumbering, startNumber, useStep, step]);

  const totalPages = Math.ceil(questionNumbers.length / QUESTIONS_PER_PAGE);
  const visibleNumbers = questionNumbers.slice(
    (akPage - 1) * QUESTIONS_PER_PAGE,
    akPage * QUESTIONS_PER_PAGE
  );

  function toggleAnswer(qNum, option) {
    setAnswerKeyData((prev) => {
      const next = { ...prev };
      if (String(next[qNum]) === String(option)) {
        delete next[qNum];
      } else {
        next[qNum] = option;
      }
      return next;
    });
  }

  if (questionNumbers.length === 0) return null;

  return (
    <div className="answer-key-grid-container">
      <div className="answer-key-grid">
        {visibleNumbers.map((qNum) => (
          <div key={qNum} className="answer-key-row">
            <span className="answer-key-qnum">{qNum}</span>
            <div className="answer-key-options">
              {ANSWER_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={`answer-key-btn ${String(answerKeyData[qNum]) === opt ? "selected" : ""}`}
                  onClick={() => toggleAnswer(qNum, opt)}
                  title={`${t("exam.answerKey.q")} ${qNum} → ${opt}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="answer-key-pagination">
          <button type="button" className="secondary-button" disabled={akPage === 1} onClick={() => setAkPage((p) => p - 1)}>
            ← {t("exam.pagination.previous")}
          </button>
          <span>{t("exam.pagination.page")} {akPage} {t("exam.pagination.of")} {totalPages}</span>
          <button type="button" className="secondary-button" disabled={akPage === totalPages} onClick={() => setAkPage((p) => p + 1)}>
            {t("exam.pagination.next")} →
          </button>
        </div>
      )}
    </div>
  );
}

function Folder() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [dataVersion, setDataVersion] =
    useState(0);

  const [showModal, setShowModal] =
    useState(false);

  const [moveExamState, setMoveExamState] = useState(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [showMoveModal, setShowMoveModal] = useState(false);

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

  const [examType, setExamType] =
    useState("practice");

  const [timerDuration, setTimerDuration] =
    useState("60");

  const [stopwatchEnabled, setStopwatchEnabled] =
    useState(false);

  const [answerKeyData, setAnswerKeyData] =
    useState({});

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

  // Effective question numbers for the open form — the answer-key grid
  // and the save path both consume this, so custom numbering can never
  // fall back to the raw (hidden, empty) count input.
  const effectiveNumbers = useMemo(() => {
    return computeFormQuestionNumbers({
      customNumbering,
      questionCount,
      startNumber,
      endNumber,
      useStep,
      step,
    });
  }, [customNumbering, questionCount, startNumber, endNumber, useStep, step]);

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
    setExamType("practice");
    setTimerDuration("60");
    setStopwatchEnabled(false);
    setAnswerKeyData({});
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

    setExamType(exam.type || "practice");
    setTimerDuration(String(exam.timerDuration || "60"));
    setStopwatchEnabled(exam.stopwatchEnabled === true);
    // Load existing answer key from exam data
    try {
      const data = JSON.parse(localStorage.getItem(getExamDataKey(exam.id)) || "{}");
      setAnswerKeyData(data.answerKey || {});
    } catch {
      setAnswerKeyData({});
    }

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
      showToast(
        t("exam.validation.nameRequired"),
        "warning"
      );
      return;
    }

    let count;

    if (customNumbering) {
      // Blank inputs are not numbers (Number("") coerces to 0, which would
      // silently create a phantom question 0).
      if (
        String(startNumber ?? "").trim() === "" ||
        String(endNumber ?? "").trim() === "" ||
        (useStep && String(step ?? "").trim() === "")
      ) {
        showToast(
          t("exam.validation.numbersInvalid"),
          "warning"
        );
        return;
      }

      const start =
        Number(startNumber);

      const end =
        Number(endNumber);

      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end)
      ) {
        showToast(
          t("exam.validation.numbersInvalid"),
          "warning"
        );
        return;
      }

      if (end < start) {
        showToast(
          t("exam.validation.endBeforeStart"),
          "warning"
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
        showToast(
          t("exam.validation.stepInvalid"),
          "warning"
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
        showToast(
          t("exam.validation.countMin"),
          "warning"
        );
        return;
      }
    }

    if (
      count >
      MAX_QUESTIONS
    ) {
      showToast(
        `${t("exam.validation.countMax")} ${MAX_QUESTIONS} باشد.`,
        "warning"
      );
      return;
    }

    // Drop key entries for questions that no longer exist (e.g. the
    // numbering was changed after keys were set). Only current numbers
    // are persisted, so reload/edit/scoring all see the same identifiers.
    const allowedNumbers = new Set(effectiveNumbers);
    const prunedKeyData = {};
    Object.entries(answerKeyData || {}).forEach(([qNum, opt]) => {
      if (allowedNumbers.has(Number(qNum))) {
        prunedKeyData[qNum] = opt;
      }
    });

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

            type: examType,
            timerDuration: examType === "exam" ? Number(timerDuration) : null,
            stopwatchEnabled: examType === "practice" ? stopwatchEnabled : false,
          }
        );

      if (!updated) {
        showToast(
          t("exam.validation.updateFailed"),
          "error"
        );
        return;
      }

      // Save answer key for exam type
      if (examType === "exam" && Object.keys(prunedKeyData).length > 0) {
        try {
          const key = getExamDataKey(editingExam.id);
          const existing = JSON.parse(localStorage.getItem(key) || "{}");
          existing.answerKey = prunedKeyData;
          localStorage.setItem(key, JSON.stringify(existing));
        } catch {
          // non-fatal: answer key was set in-memory via modal state
        }
      }
    } else {
      const newExam = {
        id: generateId(),

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

        type: examType,
        timerDuration: examType === "exam" ? Number(timerDuration) : null,
        stopwatchEnabled: examType === "practice" ? stopwatchEnabled : false,

        createdAt:
          new Date().toISOString(),
      };

      const created =
        createExam(
          newExam
        );

      if (!created) {
        showToast(
          t("exam.validation.createFailed"),
          "error"
        );
        return;
      }

      // Save answer key for exam type
      if (examType === "exam" && Object.keys(prunedKeyData).length > 0) {
        try {
          const key = getExamDataKey(newExam.id);
          const existing = JSON.parse(localStorage.getItem(key) || "{}");
          existing.answerKey = prunedKeyData;
          localStorage.setItem(key, JSON.stringify(existing));
        } catch {
          // non-fatal: answer key was set in-memory via modal state
        }
      }
    }

    refreshData();
    closeModal();
  }

  function handleDeleteExam(exam) {
    const confirmed =
      window.confirm(
        `${t("exam.delete.confirm")} «${exam.name}»`
      );

    if (!confirmed) {
      return;
    }

    const deleted =
      deleteExam(
        exam.id
      );

    if (!deleted) {
      showToast(
        t("exam.delete.failed"),
        "error"
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
      showToast(
        t("exam.move.noFolder"),
        "warning"
      );
      return;
    }

    // Modal instead of window.prompt: prompt() is unsupported in
    // Electron and IME-hostile on some WebViews. A select keeps the
    // pick reliable and fully translated.
    setMoveExamState(exam);
    setShowMoveModal(true);
  }

  function handleMoveSubmit() {
    const otherFolders = folders.filter(
      (item) => String(item.id) !== String(id)
    );
    const targetFolder = otherFolders.find(
      (f) => String(f.id) === String(moveTargetId)
    );
    const examToMove = moveExamState;

    setShowMoveModal(false);
    setMoveExamState(null);
    setMoveTargetId("");

    if (!examToMove) {
      return;
    }

    if (!targetFolder) {
      showToast(t("exam.move.invalid"), "warning");
      return;
    }

    const moved = moveExam(examToMove.id, targetFolder.id);

    if (!moved) {
      showToast(t("exam.move.failed"), "error");
      return;
    }

    refreshData();
  }

  if (!folder) {
    return (
      <section className="page-section">

        <div className="empty-state">

          <div className="empty-icon">
            <Icon name="folder" size={26} />
          </div>

          <h3>
            {t("folder.notFound")}
          </h3>

          <p>
            {t("folder.notFoundDescription")}
          </p>

          <Link
            to="/folders"
            className="primary-button"
          >
            {t("folder.backToFolders")}
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
            {t("folder.back")}
          </Link>

          <div className="folder-heading-row">

            <div className="folder-heading-icon">
              <Icon name="folder" size={22} />
            </div>

            <div>
              <h1>
                {folder.name}
              </h1>

              <p>
                {exams.length} {t("folder.examsCount")}
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
          <Icon name="plus" size={16} />
          {t("folder.newExam")}
        </button>

      </div>

      {exams.length === 0 ? (

        <div className="empty-state folder-empty-state">

          <div className="empty-icon">
            <Icon name="fileText" size={24} />
          </div>

          <h3>
            {t("folder.empty.title")}
          </h3>

          <p>
            {t("folder.empty.description")}
          </p>

          <button
            className="primary-button"
            onClick={
              openCreateModal
            }
          >
            <Icon name="plus" size={16} />
            {t("folder.empty.action")}
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
                  <Icon name="fileText" size={20} />
                </div>

                <div className="exam-list-info">

                  <h3>
                    {exam.name}
                  </h3>

                  <div className="exam-list-meta">

                    <span>
                      {exam.questionCount} {t("exam.questionCount")}
                    </span>

                    {exam.customNumbering && (
                      <>
                        <span className="meta-dot">
                          •
                        </span>

                        <span>
                          {t("exam.customNumbering")}
                        </span>
                      </>
                    )}

                    {exam.negativeMarking && (
                      <>
                        <span className="meta-dot">
                          •
                        </span>

                        <span>
                          {t("exam.negativeMarking")}
                        </span>
                      </>
                    )}

                  </div>

                </div>

                <span className="exam-list-arrow">
                  <Icon name="arrowBack" size={15} />
                </span>

              </Link>

              <div className="exam-actions">

                <button
                  type="button"
                  title={t("common.edit")}
                  aria-label={t("exam.edit.title")}
                  onClick={() =>
                    openEditModal(
                      exam
                    )
                  }
                >
                  <Icon name="pen" size={15} />
                </button>

                <button
                  type="button"
                  title="انتقال"
                  aria-label={t("exam.move.prompt")}
                  onClick={() =>
                    handleMoveExam(
                      exam
                    )
                  }
                >
                  <Icon name="folder" size={15} />
                </button>

                <button
                  type="button"
                  title={t("common.delete")}
                  aria-label={t("exam.delete.confirm")}
                  onClick={() =>
                    handleDeleteExam(
                      exam
                    )
                  }
                >
                  <Icon name="trash" size={15} />
                </button>

              </div>

            </div>

          ))}

        </div>

      )}

      <Modal
        open={showMoveModal}
        onClose={() => {
          setShowMoveModal(false);
          setMoveExamState(null);
        }}
        title={t("exam.move.prompt")}
        size="sm"
      >
        <label className="modal-label">
          {moveExamState?.name}
        </label>

        <select
          className="modal-select"
          value={moveTargetId}
          onChange={(event) => setMoveTargetId(event.target.value)}
          autoFocus
        >
          <option value="">{t("exam.move.selectFolder")}</option>
          {folders
            .filter((item) => String(item.id) !== String(id))
            .map((folder) => (
              <option key={folder.id} value={String(folder.id)}>
                {folder.name}
              </option>
            ))}
        </select>

        <div className="modal-buttons">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowMoveModal(false);
              setMoveExamState(null);
            }}
          >
            {t("exam.cancel")}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleMoveSubmit}
          >
            {t("exam.move.confirm")}
          </button>
        </div>
      </Modal>

      <Modal
        open={showModal}
        onClose={closeModal}
        title={editingExam ? t("exam.edit.title") : t("exam.create.title")}
        subtitle={editingExam ? t("exam.edit.description") : t("exam.create.description")}
        size="lg"
      >
            <div className="modal-form">

              <label>
                {t("exam.name.label")}
              </label>

              <input
                value={examName}
                onChange={(event) =>
                  setExamName(
                    event.target.value
                  )
                }
                placeholder={t("exam.name.placeholder")}
                autoFocus
              />

              <label>{t("exam.type.label")}</label>
              <div className="exam-type-toggle">
                <button
                  type="button"
                  className={`exam-type-btn ${examType === "practice" ? "active" : ""}`}
                  onClick={() => setExamType("practice")}
                >
                  <Icon name="bookOpen" size={15} /> {t("exam.type.practice")}
                </button>
                <button
                  type="button"
                  className={`exam-type-btn ${examType === "exam" ? "active" : ""}`}
                  onClick={() => setExamType("exam")}
                >
                  <Icon name="fileText" size={15} /> {t("exam.type.exam")}
                </button>
              </div>

              {examType === "exam" && (
                <>
                  <label>{t("exam.timer.label")}</label>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={timerDuration}
                    onChange={(event) => setTimerDuration(event.target.value)}
                    placeholder={t("exam.timer.default")}
                  />
                </>
              )}

              {examType === "practice" && (
                <>
                  <label>{t("exam.stopwatch.label")}</label>
                  <p className="answer-key-hint">{t("exam.stopwatch.hint")}</p>
                  <div className="exam-type-toggle" role="group" aria-label={t("exam.stopwatch.label")}>
                    <button
                      type="button"
                      className={`exam-type-btn ${stopwatchEnabled ? "active" : ""}`}
                      onClick={() => setStopwatchEnabled(true)}
                      aria-pressed={stopwatchEnabled}
                    >
                      <Icon name="timer" size={15} /> {t("exam.stopwatch.on")}
                    </button>
                    <button
                      type="button"
                      className={`exam-type-btn ${!stopwatchEnabled ? "active" : ""}`}
                      onClick={() => setStopwatchEnabled(false)}
                      aria-pressed={!stopwatchEnabled}
                    >
                      <Icon name="close" size={15} /> {t("exam.stopwatch.off")}
                    </button>
                  </div>
                </>
              )}

              {examType === "exam" && (
                <div className="answer-key-editor">
                  <label>{t("exam.answerKey.label")}</label>
                  <p className="answer-key-hint">{t("exam.answerKey.hint")}</p>

                  <div className="answer-key-bulk">
                    <button type="button" className="secondary-button" onClick={() => {
                      const newKey = {};
                      effectiveNumbers.forEach((num) => {
                        newKey[num] = "1";
                      });
                      setAnswerKeyData(newKey);
                    }}>
                      {t("exam.answerKey.setAll")}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => setAnswerKeyData({})}>
                      {t("exam.answerKey.clear")}
                    </button>
                  </div>

                  <div className="answer-key-count">
                    {Object.keys(answerKeyData).length > 0
                      ? `${Object.keys(answerKeyData).length} ${t("exam.answerKey.set")}`
                      : t("exam.answerKey.none")
                    }
                  </div>

                  <AnswerKeyGrid
                    questionCount={effectiveNumbers.length}
                    customNumbering={customNumbering}
                    startNumber={startNumber}
                    useStep={useStep}
                    step={step}
                    answerKeyData={answerKeyData}
                    setAnswerKeyData={setAnswerKeyData}
                  />
                </div>
              )}

              {!customNumbering && (
                <>
                  <label>
                    {t("exam.questionCount.label")}
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
                    placeholder={t("exam.questionCount.placeholder")}
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
                  {t("exam.customNumbering")}
                </span>

              </label>

              {customNumbering && (

                <div className="numbering-options">

                  <div className="number-inputs">

                    <div>

                      <label>
                        {t("exam.numbering.start")}
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
                        {t("exam.numbering.end")}
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
                      {t("exam.numbering.step")}
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
                      placeholder={t("exam.numbering.stepPlaceholder")}
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
                              {t("exam.numbering.preview")}
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
                    {t("exam.negativeMarking")}
                  </strong>

                  <span>
                    {t("exam.negativeMarking.description")}
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
                {t("exam.cancel")}
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  saveExamForm
                }
              >
                {editingExam
                  ? t("exam.save")
                  : t("exam.create.submit")}
              </button>

            </div>

      </Modal>

    </section>
  );
}

export default Folder;