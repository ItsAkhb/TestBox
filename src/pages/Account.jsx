import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";

import {
  syncLocalToCloud,
  syncCloudToLocal,
} from "../services/cloudSync";

function Account() {
  const navigate = useNavigate();

  const { user } = useAuth();

  const [loading, setLoading] =
    useState(false);

  const [syncLoading, setSyncLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  async function handleLogout() {
    setLoading(true);
    setMessage("");

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      console.error(
        "Failed to sign out",
        error
      );

      setMessage(
        "خروج از حساب انجام نشد."
      );

      setLoading(false);
      return;
    }

    navigate("/");

    setLoading(false);
  }

  async function handleLocalToCloud() {
    if (!user) {
      setMessage(
        "ابتدا وارد حساب شوید."
      );

      return;
    }

    setSyncLoading(true);
    setMessage("");

    try {
      const result =
        await syncLocalToCloud(
          user.id
        );

      setMessage(
        `${result.folders} فولدر و ${result.exams} آزمون با موفقیت به Cloud ارسال شد ✓`
      );
    } catch (error) {
      console.error(
        "Local to Cloud sync failed",
        error
      );

      setMessage(
        error?.message ||
          "همگام‌سازی به Cloud انجام نشد."
      );
    } finally {
      setSyncLoading(false);
    }
  }

  async function handleCloudToLocal() {
    if (!user) {
      setMessage(
        "ابتدا وارد حساب شوید."
      );

      return;
    }

    const confirmed =
      window.confirm(
        "اطلاعات فعلی Local با اطلاعات Cloud جایگزین می‌شود. ادامه می‌دهی؟"
      );

    if (!confirmed) {
      return;
    }

    setSyncLoading(true);
    setMessage("");

    try {
      const result =
        await syncCloudToLocal(
          user.id
        );

      setMessage(
        `${result.folders} فولدر و ${result.exams} آزمون از Cloud بازیابی شد ✓`
      );

      setTimeout(() => {
        navigate("/");
      }, 800);

    } catch (error) {
      console.error(
        "Cloud to Local sync failed",
        error
      );

      setMessage(
        error?.message ||
          "دریافت اطلاعات از Cloud انجام نشد."
      );
    } finally {
      setSyncLoading(false);
    }
  }

  return (
    <section className="page-section">

      <div className="page-title">

        <div>
          <h1>
            حساب کاربری
          </h1>

          <p>
            مدیریت حساب و اتصال TestBox
          </p>
        </div>

      </div>


      <div
        className="settings-section"
        style={{
          maxWidth: "650px",
        }}
      >

        <h2>
          حساب فعلی
        </h2>

        <p>
          {user?.email ||
            "کاربر ناشناس"}
        </p>


        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            marginTop: "18px",
          }}
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
            {syncLoading
              ? "در حال همگام‌سازی..."
              : "Local → Cloud"}
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
            {syncLoading
              ? "در حال دریافت..."
              : "Cloud → Local"}
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
            {loading
              ? "در حال خروج..."
              : "خروج از حساب"}
          </button>

        </div>


        {message && (
          <p
            style={{
              marginTop: "14px",
              color:
                message.includes("✓")
                  ? "var(--success)"
                  : "var(--danger)",
            }}
          >
            {message}
          </p>
        )}

      </div>

    </section>
  );
}

export default Account;