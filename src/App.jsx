import {
  Routes,
  Route,
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
import Account from "./pages/Account";

import CloudSyncManager from "./components/CloudSyncManager";

import { useAuth } from "./context/AuthContext";

import "./App.css";

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
            <Route path="/account" element={<Account />} />
          </Route>

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </ErrorBoundary>
    </>
  );
}

export default App;
