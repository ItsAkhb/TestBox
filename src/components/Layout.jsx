import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "./layout/Sidebar";
import TopBar from "./layout/TopBar";
import MobileNav from "./layout/MobileNav";
import { initAndroidBackButton } from "../services/native";

function Layout() {
  const location = useLocation();

  useEffect(() => {
    const saved = localStorage.getItem("testbox-theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

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
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

export default Layout;
