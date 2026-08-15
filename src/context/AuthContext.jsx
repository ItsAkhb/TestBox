import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { supabase } from "../services/supabaseClient";

import {
  setStorageUser,
} from "../services/dataService";


const AuthContext = createContext(null);


export function AuthProvider({
  children,
}) {
  const [session, setSession] =
    useState(null);

  const [loading, setLoading] =
    useState(true);


  useEffect(() => {
    let mounted = true;


    async function loadSession() {
      const {
        data,
        error,
      } =
        await supabase.auth.getSession();


      if (error) {
        console.error(
          "Failed to load auth session",
          error
        );
      }


      const currentSession =
        data?.session ?? null;


      if (mounted) {
        setSession(
          currentSession
        );

        setStorageUser(
          currentSession?.user?.id ??
          null
        );

        setLoading(false);
      }
    }


    loadSession();


    const {
      data: listener,
    } =
      supabase.auth.onAuthStateChange(
        (_event, newSession) => {

          setSession(
            newSession ?? null
          );


          setStorageUser(
            newSession?.user?.id ??
            null
          );
        }
      );


    return () => {
      mounted = false;

      listener.subscription.unsubscribe();
    };

  }, []);


  return (
    <AuthContext.Provider
      value={{
        session,
        user:
          session?.user ??
          null,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}



export function useAuth() {
  const context =
    useContext(AuthContext);


  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider"
    );
  }


  return context;
}