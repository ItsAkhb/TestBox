import {
  Link,
  useLocation,
} from "react-router-dom";

import {
  useEffect,
  useState,
} from "react";

import { useAuth } from "../context/AuthContext";
import { useSync } from "../context/SyncContext";


function Layout({ children }) {

  const location =
    useLocation();


  const { user } =
    useAuth();


  const {
    syncStatus,
  } = useSync();



  const [darkMode, setDarkMode] =
    useState(() => {

      return (
        localStorage.getItem(
          "testbox-theme"
        ) === "dark"
      );

    });



  useEffect(() => {

    document.documentElement.setAttribute(
      "data-theme",
      darkMode
        ? "dark"
        : "light"
    );


    localStorage.setItem(
      "testbox-theme",
      darkMode
        ? "dark"
        : "light"
    );


  }, [
    darkMode,
  ]);



  const isActive = (path) =>
    location.pathname === path;



  return (

    <div className="app">


      <aside className="sidebar">


        <div className="logo">

          <span className="logo-icon">
            ✓
          </span>

          <span>
            TestBox
          </span>

        </div>




        <nav className="navigation">


          <Link
            to="/"
            className={`nav-item ${
              isActive("/")
                ? "active"
                : ""
            }`}
          >

            <span>
              ⌂
            </span>

            <span>
              خانه
            </span>

          </Link>





          <Link
            to="/folders"
            className={`nav-item ${
              isActive("/folders")
                ? "active"
                : ""
            }`}
          >

            <span>
              ▣
            </span>

            <span>
              فولدرها
            </span>

          </Link>





          <Link
            to="/marked"
            className={`nav-item ${
              isActive("/marked")
                ? "active"
                : ""
            }`}
          >

            <span>
              ★
            </span>

            <span>
              مارک‌شده‌ها
            </span>

          </Link>



        </nav>





        <div className="sidebar-bottom">



          <Link
            to={
              user
                ? "/account"
                : "/login"
            }
            className={`nav-item ${
              isActive(
                user
                  ? "/account"
                  : "/login"
              )
                ? "active"
                : ""
            }`}
          >

            <span>
              {
                user
                  ? "●"
                  : "♙"
              }
            </span>


            <span>
              {
                user
                  ? "حساب کاربری"
                  : "ورود"
              }
            </span>


          </Link>





          <Link
            to="/settings"
            className={`nav-item ${
              isActive("/settings")
                ? "active"
                : ""
            }`}
          >

            <span>
              ⚙
            </span>

            <span>
              تنظیمات
            </span>


          </Link>



        </div>


      </aside>






      <main className="main-content">


        <header className="topbar">


          <div className="sync-status">


            {
              syncStatus === "syncing" && (
                <span>
                  🔄 در حال همگام‌سازی
                </span>
              )
            }



            {
              syncStatus === "synced" && (
                <span>
                  ✓ ذخیره شد
                </span>
              )
            }



            {
              syncStatus === "error" && (
                <span>
                  ⚠ خطا در همگام‌سازی
                </span>
              )
            }



          </div>





          <button
            className="theme-button"
            onClick={() =>
              setDarkMode(
                (current) =>
                  !current
              )
            }
            title="تغییر حالت"
          >

            {
              darkMode
                ? "☀"
                : "☾"
            }


          </button>



        </header>





        {children}





      </main>






      <nav className="mobile-navigation">



        <Link
          to="/"
          className={`mobile-nav-item ${
            isActive("/")
              ? "active"
              : ""
          }`}
        >

          <span>
            ⌂
          </span>

          <span>
            خانه
          </span>

        </Link>





        <Link
          to="/folders"
          className={`mobile-nav-item ${
            isActive("/folders")
              ? "active"
              : ""
          }`}
        >

          <span>
            ▣
          </span>

          <span>
            فولدرها
          </span>

        </Link>





        <Link
          to="/marked"
          className={`mobile-nav-item ${
            isActive("/marked")
              ? "active"
              : ""
          }`}
        >

          <span>
            ★
          </span>

          <span>
            مارک‌شده
          </span>

        </Link>





        <Link
          to={
            user
              ? "/account"
              : "/login"
          }
          className={`mobile-nav-item ${
            isActive(
              user
                ? "/account"
                : "/login"
            )
              ? "active"
              : ""
          }`}
        >

          <span>
            {
              user
                ? "●"
                : "♙"
            }
          </span>


          <span>
            {
              user
                ? "حساب"
                : "ورود"
            }
          </span>


        </Link>



      </nav>



    </div>

  );

}


export default Layout;