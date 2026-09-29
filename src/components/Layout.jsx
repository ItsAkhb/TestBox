import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./layout/Sidebar";
import TopBar from "./layout/TopBar";
import MobileNav from "./layout/MobileNav";
import { initAndroidBackButton } from "../services/native";

function Layout() {
  const location = useLocation();

  useEffect(() => {
    initAndroidBackButton(null, location.pathname);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    const stage = document.querySelector(".page-stage");
    if (stage) stage.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar />

      <div className="app-main">
        <TopBar />

        <main className="page-stage">
          <div key={location.pathname} className="page-route">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

export default Layout;
