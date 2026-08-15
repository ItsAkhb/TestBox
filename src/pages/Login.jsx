import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../services/supabaseClient";



function Login() {

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

        "ایمیل یا رمز عبور اشتباه است."

      );



      return;

    }







    navigate("/");



  }













  return (


    <section className="auth-page">







      <div className="auth-card">







        <div className="auth-title">







          <h1>

            ورود به حساب

          </h1>








          <p>

            برای همگام‌سازی اطلاعات وارد حساب خود شوید.

          </p>







        </div>














        <form

          onSubmit={handleLogin}

          className="auth-form"

        >







          <label>

            ایمیل

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

            رمز عبور

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

              ? "در حال ورود..."

              : "ورود"}




          </button>









        </form>












        <p

          className="auth-footer"

        >






          حساب نداری؟





          {" "}








          <Link

            to="/signup"

            className="auth-link"

          >



            ساخت حساب




          </Link>






        </p>









      </div>








    </section>


  );

}





export default Login;