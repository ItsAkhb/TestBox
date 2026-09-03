import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";

import {
  syncLocalToCloud,
  syncCloudToLocal,
} from "../services/cloudSync";
import { useTranslation } from "../i18n";
import { useToast } from "../context/ToastContext";
import Icon from "../components/ui/Icon";
import PageHeader from "../components/ui/PageHeader";

function Account() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { user } = useAuth();

  const [loading, setLoading] =
    useState(false);

  const [syncLoading, setSyncLoading] =
    useState(false);

  async function handleLogout() {
    setLoading(true);

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "Failed to sign out",
        error
      );

      showToast(
        t("account.logout.failed"),
        "error"
      );

      setLoading(false);
      return;
    }

    navigate("/");

    setLoading(false);
  }

  async function handleLocalToCloud() {
    if (!user) {
      showToast(
        t("account.loginRequired"),
        "error"
      );

      return;
    }

    setSyncLoading(true);

    try {
      const result =
        await syncLocalToCloud(
          user.id
        );

      showToast(
        `${result.folders} ${t("common.folders")} و ${result.exams} ${t("common.tests")} ${t("account.sync.success")}`,
        "success"
      );
    } catch (error) {
      console.error(
        "Local to Cloud sync failed",
        error
      );

      showToast(
        error?.message ||
          t("account.sync.failed"),
        "error"
      );
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleCloudToLocal() {
    if (!user) {
      showToast(
        t("account.loginRequired"),
        "error"
      );

      return;
    }

    const confirmed =
      window.confirm(
        t("account.cloudToLocal.confirm")
      );

    if (!confirmed) {
      return;
    }

    setSyncLoading(true);

    try {
      const result =
        await syncCloudToLocal(
          user.id
        );

      showToast(
        `${result.folders} ${t("common.folders")} و ${result.exams} ${t("common.tests")} ${t("account.cloudToLocal.success")}`,
        "success"
      );

      setTimeout(() => {
        navigate("/");
      }, 800);

    } catch (error) {
      console.error(
        "Cloud to Local sync failed",
        error
      );

      showToast(
        error?.message ||
          t("account.cloudToLocal.failed"),
        "error"
      );
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <section className="page-section">

      <PageHeader
        icon="user"
        title={t("account.title")}
        subtitle={t("account.subtitle")}
      />


      <div
        className="settings-section account-card"
      >

        <h2>
          {t("account.current")}
        </h2>

        <p className="account-email">
          <Icon name="user" size={15} />
          {user?.email ||
            t("account.anonymous")}
        </p>


        <div
          className="account-actions"
        >

          <button
            type="button"
            className="primary-button"
            onClick={
              handleLocalToCloud
            }
            disabled={
              syncLoading ||
              loading
            }
          >
            <Icon name="upload" size={15} />
            {syncLoading
              ? t("account.syncing")
              : t("account.syncToLocal")}
          </button>


          <button
            type="button"
            className="secondary-button"
            onClick={
              handleCloudToLocal
            }
            disabled={
              syncLoading ||
              loading
            }
          >
            <Icon name="download" size={15} />
            {syncLoading
              ? t("account.receiving")
              : t("account.syncToCloud")}
          </button>


          <button
            type="button"
            className="danger-button"
            onClick={
              handleLogout
            }
            disabled={
              loading ||
              syncLoading
            }
          >
            <Icon name="logout" size={15} />
            {loading
              ? t("account.loggingOut")
              : t("account.logout")}
          </button>

        </div>

      </div>

    </section>
  );
}

export default Account;