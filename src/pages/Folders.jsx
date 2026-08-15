import { useState } from "react";
import { Link } from "react-router-dom";

import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from "../services/dataService";

function Folders() {
  const [folders, setFolders] = useState(() => {
    return getFolders();
  });

  const [showModal, setShowModal] =
    useState(false);

  const [folderName, setFolderName] =
    useState("");

  function refreshFolders() {
    setFolders(getFolders());
  }

  function handleCreateFolder() {
    const name = folderName.trim();

    if (!name) {
      alert("اسم فولدر را وارد کن");
      return;
    }

    const newFolder = {
      id: Date.now(),
      name,
      createdAt:
        new Date().toISOString(),
    };

    const saved =
      createFolder(newFolder);

    if (!saved) {
      alert("ساخت فولدر انجام نشد.");
      return;
    }

    refreshFolders();

    setFolderName("");
    setShowModal(false);
  }

  function handleDeleteFolder(id) {
    const ok = window.confirm(
      "این فولدر و آزمون‌های داخلش حذف شوند؟"
    );

    if (!ok) {
      return;
    }

    const deleted =
      deleteFolder(id);

    if (!deleted) {
      alert(
        "حذف فولدر انجام نشد."
      );
      return;
    }

    refreshFolders();
  }

  function handleRenameFolder(folder) {
    const newName = prompt(
      "نام جدید:",
      folder.name
    );

    if (!newName?.trim()) {
      return;
    }

    const updated =
      updateFolder(
        folder.id,
        {
          name: newName.trim(),
        }
      );

    if (!updated) {
      alert(
        "تغییر نام فولدر انجام نشد."
      );
      return;
    }

    refreshFolders();
  }

  return (
    <section className="page-section">

      <div className="page-title folders-page-title">

        <div>
          <h1>📁 فولدرها</h1>

          <p>
            مدیریت دسته‌بندی آزمون‌ها
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() =>
            setShowModal(true)
          }
        >
          + فولدر جدید
        </button>

      </div>

      {folders.length === 0 ? (

        <div className="empty-state">

          <div className="empty-icon">
            📁
          </div>

          <h3>
            هنوز فولدری ندارید
          </h3>

          <p>
            اولین فولدر خودت را بساز
          </p>

        </div>

      ) : (

        <div className="folder-grid">

          {folders.map((folder) => (

            <div
              key={folder.id}
              className="folder-card"
            >

              <Link
                to={`/folder/${folder.id}`}
                className="folder-main"
              >

                <div className="folder-icon">
                  📁
                </div>

                <div className="folder-info">

                  <h3>
                    {folder.name}
                  </h3>

                </div>

              </Link>

              <div className="folder-actions">

                <button
                  type="button"
                  onClick={() =>
                    handleRenameFolder(
                      folder
                    )
                  }
                >
                  ✏️
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDeleteFolder(
                      folder.id
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
          onClick={() =>
            setShowModal(false)
          }
        >

          <div
            className="modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <h2>
              ساخت فولدر جدید
            </h2>

            <input
              value={folderName}
              onChange={(event) =>
                setFolderName(
                  event.target.value
                )
              }
              placeholder="مثلاً ریاضی"
            />

            <div className="modal-buttons">

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowModal(false)
                }
              >
                لغو
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  handleCreateFolder
                }
              >
                ساخت
              </button>

            </div>

          </div>

        </div>

      )}

    </section>
  );
}

export default Folders;