import {
  createContext,
  useContext,
  useState,
} from "react";

const SyncContext =
  createContext(null);


export function SyncProvider({
  children,
}) {
  const [syncStatus, setSyncStatus] =
    useState("idle");

  return (
    <SyncContext.Provider
      value={{
        syncStatus,
        setSyncStatus,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}


export function useSync() {
  const context =
    useContext(SyncContext);

  if (!context) {
    throw new Error(
      "useSync must be used inside SyncProvider"
    );
  }

  return context;
}
