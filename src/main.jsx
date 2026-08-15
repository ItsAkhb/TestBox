import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  HashRouter,
} from "react-router-dom";

import "./index.css";

import App from "./App.jsx";

import {
  AuthProvider,
} from "./context/AuthContext";

import {
  SyncProvider,
} from "./context/SyncContext";



createRoot(
  document.getElementById("root")
).render(

  <StrictMode>

    <HashRouter>

      <AuthProvider>

        <SyncProvider>

          <App />

        </SyncProvider>

      </AuthProvider>

    </HashRouter>

  </StrictMode>

);