import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../services/supabaseClient";
import { useTranslation } from "../i18n";
import Icon from "../components/ui/Icon";



function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();



  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);





  async function handleSignup(event) {

    event.preventDefault();


    setError("");
    setMessage("");



    if (password.length < 6) {


      setError(
        t("auth.signup.passwordMin")
      );


      return;

    }




    setLoading(true);





    const {
      data,
      error: signupError,
    } =
      await supabase.auth.signUp({

        email: email.trim(),

        password,

      });





    setLoading(false);







    if (signupError) {


      console.error(
        "Signup error:",
        signupError
      );



      setError(
        signupError.message ||
        t("auth.signup.failed")
      );



      return;

    }








    if (data.session) {


      navigate("/");


      return;

    }







    setMessage(
      t("auth.signup.success")
    );


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
            {t("auth.signup.title")}
          </h1>








          <p>
            {t("auth.signup.subtitle")}
          </p>







        </div>









        <form

          onSubmit={handleSignup}

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

            aria-describedby={error ? "signup-error" : undefined}

            required

          />












          <label>
            {t("auth.password")}
          </label>








          <input

            type={showPassword ? "text" : "password"}

            value={password}

            onChange={(event) =>

              setPassword(

                event.target.value

              )

            }

            autoComplete="new-password"

            minLength={6}

            aria-invalid={error ? "true" : undefined}

            aria-describedby={error ? "signup-error" : undefined}

            required

          />

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

              id="signup-error"

              className="
                auth-message
                auth-error
              "

              role="alert"

            >

              {error}


            </div>


          )}













          {message && (


            <div

              className="
                auth-message
                auth-success
              "

            >

              {message}


            </div>


          )}













          <div

            className="auth-actions"

          >







            <button

              type="submit"

              className="
                primary-button
                auth-submit
              "

              disabled={loading}

            >



              {loading
                ? t("auth.signup.loading")
                : t("auth.signup.submit")}



            </button>







          </div>








        </form>









        <p

          className="auth-footer"

        >






          {t("auth.hasAccount")}






          {" "}








          <Link

            to="/login"

            className="auth-link"

          >

            {t("auth.goToLogin")}


          </Link>







        </p>








      </div>








    </section>

  );

}



export default Signup;