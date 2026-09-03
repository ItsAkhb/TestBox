import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../services/supabaseClient";
import { useTranslation } from "../i18n";
import LogoMark from "../components/ui/LogoMark";



function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();





  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");








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













  return (


    <section className="auth-page">







      <aside className="auth-art" aria-hidden="true">
        <LogoMark size={72} />
        <span className="auth-art-brand">TestBox</span>
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

            required

          />













          <label>
            {t("auth.password")}
          </label>









          <input

            type="password"

            value={password}

            onChange={(event) =>

              setPassword(

                event.target.value

              )

            }

            autoComplete="current-password"

            required

          />














          {error && (



            <div

              className="
                auth-message
                auth-error
              "

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