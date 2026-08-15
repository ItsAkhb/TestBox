import { useRef, useState } from "react";

import {
  createBackup,
  restoreBackup,
  validateBackup,
  clearAll,
} from "../services/dataService";

function Settings() {
  const fileInputRef = useRef(null);

  const [message, setMessage] = useState("");

  function showMessage(text) {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  function exportBackup() {
    try {
      const backup = createBackup();

      const json = JSON.stringify(
        backup,
        null,
        2
      );

      const blob = new Blob(
        [json],
        {
          type: "application/json",
        }
      );

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      const date = new Date()
        .toISOString()
        .slice(0, 10);

      link.href = url;
      link.download = `testbox-backup-${date}.json`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(url);

      showMessage(
        "پشتیبان با موفقیت ساخته شد ✓"
      );
    } catch (error) {
      console.error(
        "Failed to export backup",
        error
      );

      showMessage(
        "ساخت پشتیبان انجام نشد."
      );
    }
  }

  function openImport() {
    fileInputRef.current?.click();
  }

  function importBackup(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const backup = JSON.parse(
          reader.result
        );

        if (!validateBackup(backup)) {
          throw new Error(
            "Invalid backup"
          );
        }

        const confirmed = window.confirm(
          "با وارد کردن این پشتیبان، اطلاعات فعلی TestBox جایگزین می‌شود. ادامه می‌دهی؟"
        );

        if (!confirmed) {
          return;
        }

        const restored = restoreBackup(backup);

        if (!restored) {
          throw new Error(
            "Restore failed"
          );
        }

        showMessage(
          "پشتیبان با موفقیت بازیابی شد ✓"
        );

        setTimeout(() => {
          window.location.href = "/";
        }, 1000);
      } catch (error) {
        console.error(
          "Failed to import backup",
          error
        );

        showMessage(
          "فایل پشتیبان معتبر نیست."
        );
      } finally {
        event.target.value = "";
      }
    };

    reader.onerror = () => {
      showMessage(
        "خواندن فایل پشتیبان انجام نشد."
      );

      event.target.value = "";
    };

    reader.readAsText(file);
  }

  function clearAllData() {
    const firstConfirm = window.confirm(
      "تمام فولدرها، آزمون‌ها، جواب‌ها، مارک‌ها و یادداشت‌ها حذف می‌شوند. مطمئنی؟"
    );

    if (!firstConfirm) {
      return;
    }

    const secondConfirm = window.confirm(
      "این کار قابل بازگشت نیست. قبلش Backup داری؟"
    );

    if (!secondConfirm) {
      return;
    }

    const cleared = clearAll();

    if (!cleared) {
      showMessage(
        "حذف اطلاعات انجام نشد."
      );

      return;
    }

    window.location.href = "/";
  }

  return (
    <section className="page-section">

      <div className="page-title">

        <div>
          <h1>⚙️ تنظیمات</h1>

          <p>
            مدیریت اطلاعات و پشتیبان TestBox
          </p>
        </div>

      </div>

      <div className="settings-section">

        <div className="settings-section-header">

          <div>
            <h2>💾 اطلاعات</h2>

            <p>
              از اطلاعاتت نسخه پشتیبان بگیر
              یا یک Backup قبلی را برگردان.
            </p>
          </div>

        </div>

        <div className="settings-actions">

          <button
            className="settings-action"
            onClick={exportBackup}
          >

            <span className="settings-action-icon">
              ↓
            </span>

            <span>
              <strong>
                خروجی گرفتن
              </strong>

              <small>
                ذخیره تمام اطلاعات به صورت فایل JSON
              </small>
            </span>

          </button>

          <button
            className="settings-action"
            onClick={openImport}
          >

            <span className="settings-action-icon">
              ↑
            </span>

            <span>
              <strong>
                وارد کردن Backup
              </strong>

              <small>
                بازیابی اطلاعات از فایل JSON
              </small>
            </span>

          </button>

        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={importBackup}
          hidden
        />

      </div>

      <div className="settings-danger">

        <div>
          <h2>⚠️ منطقه خطر</h2>

          <p>
            حذف تمام اطلاعات ذخیره‌شده در این
            مرورگر.
          </p>
        </div>

        <button
          className="danger-button"
          onClick={clearAllData}
        >
          حذف تمام اطلاعات
        </button>

      </div>

      {message && (
        <div className="settings-message">
          {message}
        </div>
      )}

    </section>
  );
}

export default Settings;