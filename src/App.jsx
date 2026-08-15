import {
  Routes,
  Route,
} from "react-router-dom";


import Layout from "./components/Layout";


import Home from "./pages/Home";
import Folder from "./pages/Folder";
import Exam from "./pages/Exam";
import Folders from "./pages/Folders";
import Marked from "./pages/Marked";
import Settings from "./pages/Settings";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Account from "./pages/Account";


import CloudSyncManager from "./components/CloudSyncManager";


import {
  useAuth,
} from "./context/AuthContext";


import "./App.css";



function App() {

  const {
    loading,
  } = useAuth();



  if (loading) {
    return null;
  }



  return (
    <>

      <CloudSyncManager />


      <Layout>

        <Routes>


          <Route
            path="/"
            element={
              <Home />
            }
          />


          <Route
            path="/folders"
            element={
              <Folders />
            }
          />


          <Route
            path="/folder/:id"
            element={
              <Folder />
            }
          />


          <Route
            path="/exam/:id"
            element={
              <Exam />
            }
          />


          <Route
            path="/marked"
            element={
              <Marked />
            }
          />


          <Route
            path="/settings"
            element={
              <Settings />
            }
          />


          <Route
            path="/login"
            element={
              <Login />
            }
          />


          <Route
            path="/signup"
            element={
              <Signup />
            }
          />


          <Route
            path="/account"
            element={
              <Account />
            }
          />


        </Routes>

      </Layout>

    </>
  );
}



export default App;