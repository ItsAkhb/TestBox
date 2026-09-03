import {
  createContext,
  useContext,
  useState,
} from "react";

const SyncContext =
  createContext(null);

// Status model: idle (logged out) | syncing | synced | pending
// (unsynced local changes, waiting for connectivity) | offline
// (no connectivity, nothing pending) | error.
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
