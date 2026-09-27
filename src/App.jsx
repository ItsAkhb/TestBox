import {
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

import Home from "./pages/Home";
import Folder from "./pages/Folder";
import Exam from "./pages/Exam";
import ExamStart from "./pages/ExamStart";
import ExamResults from "./pages/ExamResults";
import Folders from "./pages/Folders";
import Subjects from "./pages/Subjects";
import Marked from "./pages/Tags";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import CloudSyncManager from "./components/CloudSyncManager";
import OfflineModePrompt from "./components/ui/OfflineModePrompt";

import { useAuth } from "./context/AuthContext";

import "./App.css";

// Single source of truth for the post-auth UI transition: whenever a
// session exists while an auth screen is showing (OAuth callback via
// testbox:// or Android intent, restored WebView hash, email login,
// cold start with a saved session), route to the authenticated shell.
// Declarative — no timers, no duplicate navigation systems.
function RequireLoggedOut({ children }) {
  const { session } = useAuth();

  if (session) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" />
      </div>
    );
  }

  return (
    <>
      <CloudSyncManager />
      <OfflineModePrompt />

      <ErrorBoundary>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/folders" element={<Folders />} />
            <Route path="/subjects" element={<Subjects />} />
            <Route path="/folder/:id" element={<Folder />} />
            <Route path="/exam/:id" element={<Exam />} />
            <Route path="/exam/:id/start" element={<ExamStart />} />
            <Route path="/exam/:id/results" element={<ExamResults />} />
            <Route path="/marked" element={<Marked />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/calendar" element={<Calendar />} />
            {/* Legacy deep links: Account was merged into Settings */}
            <Route path="/account" element={<Navigate to="/settings" replace />} />
          </Route>

          <Route
            path="/login"
            element={
              <RequireLoggedOut>
                <Login />
              </RequireLoggedOut>
            }
          />
          <Route
            path="/signup"
            element={
              <RequireLoggedOut>
                <Signup />
              </RequireLoggedOut>
            }
          />
        </Routes>
      </ErrorBoundary>
    </>
  );
}

export default App;
