import { useState } from "react";
import {
  Link,
  useNavigate,
} from "react-router-dom";

import { supabase } from "../services/supabaseClient";



function Signup() {

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





  async function handleSignup(event) {

    event.preventDefault();


    setError("");
    setMessage("");



    if (password.length < 6) {


      setError(
        "رمز عبور باید حداقل ۶ کاراکتر باشد."
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

        "ساخت حساب انجام نشد."

      );



      return;

    }








    if (data.session) {


      navigate("/");


      return;

    }







    setMessage(

      "حساب ساخته شد. اگر تأیید ایمیل فعال است، ایمیل خود را بررسی کنید."

    );


  }









  return (

    <section className="auth-page">





      <div className="auth-card">







        <div className="auth-title">





          <h1>

            ساخت حساب

          </h1>








          <p>

            برای ذخیره و همگام‌سازی اطلاعاتت حساب بساز.

          </p>







        </div>









        <form

          onSubmit={handleSignup}

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

            autoComplete="new-password"

            minLength={6}

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

                ? "در حال ساخت..."

                : "ساخت حساب"}



            </button>







          </div>








        </form>









        <p

          className="auth-footer"

        >






          حساب داری؟






          {" "}








          <Link

            to="/login"

            className="auth-link"

          >

            ورود


          </Link>







        </p>








      </div>








    </section>

  );

}



export default Signup;