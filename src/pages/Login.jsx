import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../i18n";
import Icon from "../components/ui/Icon";



function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signInWithGoogle, googleLoading, googleError } = useAuth();





  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);









  async function handleLogin(event) {

    event.preventDefault();



    setError("");

    setLoading(true);








    const {

      error: loginError,

    } =

      await supabase.auth.signInWithPassword({

        email: email.trim(),

        password,

      });








    setLoading(false);








    if (loginError) {



      setError(
        t("auth.login.error")
      );



      return;

    }







    navigate("/");



  }

  async function handleGoogleLogin() {
    setError("");
    await signInWithGoogle();
  }









  return (


    <section className="auth-page">








      <aside className="auth-art" aria-hidden="true">
        <img
          className="auth-art-logo"
          src={`${import.meta.env.BASE_URL}brand/testbox-primary-lockup-dark.svg`}
          alt=""
        />
      </aside>

      <div className="auth-card">








        <div className="auth-title">






          <h1>
            {t("auth.login.title")}
          </h1>







          <p>
            {t("auth.login.subtitle")}
          </p>








        </div>











        <button
          type="button"
          className="primary-button auth-google"
          onClick={handleGoogleLogin}
          disabled={googleLoading || loading}
        >
          {googleLoading
            ? t("auth.google.loading")
            : t("auth.google.continue")}
        </button>

        {googleError && (
          <div className="auth-message auth-error" role="alert">
            {t(googleError)}
          </div>
        )}

        <div className="auth-divider" aria-hidden="true">
          <span>{t("auth.orEmail")}</span>
        </div>

        <form

          onSubmit={handleLogin}

          className="auth-form"

        >







          <label>
            {t("auth.email")}
          </label>







          <input

            type="email"

            value={email}

            onChange={(event) =>

              setEmail(

                event.target.value

              )

            }

            autoComplete="email"

            aria-invalid={error ? "true" : undefined}

            aria-describedby={error ? "login-error" : undefined}

            required

          />











          <label>
            {t("auth.password")}
          </label>







          {showPassword ? (
            <input

              type="text"

              value={password}

              onChange={(event) =>

                setPassword(

                  event.target.value

                )

              }

              autoComplete="current-password"

              aria-invalid={error ? "true" : undefined}

              aria-describedby={error ? "login-error" : undefined}

              required

            />
          ) : (
            <input

              type="password"

              value={password}

              onChange={(event) =>

                setPassword(

                  event.target.value

                )

              }

              autoComplete="current-password"

              aria-invalid={error ? "true" : undefined}

              aria-describedby={error ? "login-error" : undefined}

              required

            />
          )}

          <button

            type="button"

            className="auth-password-toggle"

            onClick={() => setShowPassword((prev) => !prev)}

            aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}

            aria-pressed={showPassword}

          >

            <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />

          </button>












          {error && (



            <div

              id="login-error"

              className="
                auth-message
                auth-error
              "

              role="alert"

            >

              {error}



            </div>



          )}









          <button

            type="submit"

            className="
              primary-button
              auth-submit
            "

            disabled={loading}

          >






            {loading
              ? t("auth.login.loading")
              : t("auth.login.submit")}





          </button>







        </form>











        <p

          className="auth-footer"

        >






          {t("auth.noAccount")}







          {" "}






          <Link

            to="/signup"

            className="auth-link"

          >






            {t("auth.createAccount")}






          </Link>




        </p>





      </div>




    </section>


  );

}




export default Login;
