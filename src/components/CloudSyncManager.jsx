import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useAuth } from "../context/AuthContext";

import {
  getFolders,
  getExams,
  getExamData,
  getSubjects,
  getSettings,
  getTags,
  getActivity,
  getDirtyState,
  clearDirtySection,
  hasPendingLocalChanges,
  setStorageUser,
} from "../services/dataService";

import {
  syncLocalToCloud,
  syncCloudToLocal,
} from "../services/cloudSync";

import { supabase } from "../services/supabaseClient";

import { useSync } from "../context/SyncContext";

// Exponential backoff for failed sync attempts while online.
// 5s → 10s → 20s → 40s → 80s → 160s → 300s (cap).
const BACKOFF_BASE_MS = 5000;
const BACKOFF_CAP_MS = 5 * 60 * 1000;

function computeBackoffMs(attempt) {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

function CloudSyncManager() {

  const { user, isOffline } = useAuth();

  const {
    setSyncStatus,
  } = useSync();

  const syncingRef =
    useRef(false);

  const pendingSyncRef =
    useRef(false);

  const backoffAttemptRef =
    useRef(0);

  const backoffTimerRef =
    useRef(null);

  const offlineRef =
    useRef(false);

  useEffect(() => {
    offlineRef.current = isOffline;
  }, [isOffline]);



  useEffect(() => {

    if (user) {

      setStorageUser(
        user.id
      );

    } else {

      setStorageUser(null);

      setSyncStatus(
        "idle"
      );

    }

  }, [
    user,
    setSyncStatus,
  ]);

  const syncLocalChangesRef = useRef(null);

  // Pushes the dirty snapshot, then clears dirty marks ONLY for content
  // identical to what was actually uploaded. An edit landing mid-push
  // changes the fingerprint, so its section stays dirty and re-uploads
  // on the next cycle — no silently dropped changes.
  const pushAndClearDirty = useCallback(async (userId) => {
    const dirty = getDirtyState();
    const fingerprint = (value) => {
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    };

    const before = {
      folders: dirty.folders ? fingerprint(getFolders()) : null,
      exams: dirty.exams ? fingerprint(getExams()) : null,
      subjects: dirty.subjects ? fingerprint(getSubjects()) : null,
      settings: dirty.settings ? fingerprint(getSettings()) : null,
      tags: dirty.tags ? fingerprint(getTags()) : null,
      examData: {},
      activity: {},
    };
    Object.keys(dirty.examData || {}).forEach((examId) => {
      if (dirty.examData[examId]) {
        before.examData[examId] = fingerprint(getExamData(examId));
      }
    });
    Object.keys(dirty.activity || {}).forEach((day) => {
      if (dirty.activity[day]) {
        before.activity[day] = fingerprint(getActivity(day));
      }
    });

    await syncLocalToCloud(userId, { dirty });

    if (dirty.deletes.length > 0) {
      // Tombstones carry no content that can change mid-push.
      clearDirtySection("deletes");
    }
    if (before.folders !== null && fingerprint(getFolders()) === before.folders) {
      clearDirtySection("folders");
    }
    if (before.exams !== null && fingerprint(getExams()) === before.exams) {
      clearDirtySection("exams");
    }
    if (before.subjects !== null && fingerprint(getSubjects()) === before.subjects) {
      clearDirtySection("subjects");
    }
    if (before.settings !== null && fingerprint(getSettings()) === before.settings) {
      clearDirtySection("settings");
    }
    if (before.tags !== null && fingerprint(getTags()) === before.tags) {
      clearDirtySection("tags");
    }
    Object.keys(before.examData).forEach((examId) => {
      if (fingerprint(getExamData(examId)) === before.examData[examId]) {
        clearDirtySection("examData", [examId]);
      }
    });
    Object.keys(before.activity).forEach((day) => {
      if (fingerprint(getActivity(day)) === before.activity[day]) {
        clearDirtySection("activity", [day]);
      }
    });
  }, []);

  const clearBackoff = useCallback(() => {
    if (backoffTimerRef.current) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    clearBackoff();
    const delay = computeBackoffMs(backoffAttemptRef.current);
    backoffAttemptRef.current = Math.min(backoffAttemptRef.current + 1, 20);
    backoffTimerRef.current = setTimeout(() => {
      backoffTimerRef.current = null;
      if (!offlineRef.current && pendingSyncRef.current) {
        syncLocalChangesRef.current?.();
      }
    }, delay);
  }, [clearBackoff]);



  const syncLocalChanges =
    useCallback(async () => {

      if (!user) {
        return;
      }

      if (offlineRef.current) {
        pendingSyncRef.current = true;
        // Local edits made while offline must flip the dot to
        // "pending" (offline + unsynced changes), not stay "offline".
        setSyncStatus(
          hasPendingLocalChanges() ? "pending" : "offline"
        );
        return;
      }

      pendingSyncRef.current = true;


      if (syncingRef.current) {
        return;
      }


      syncingRef.current = true;


      try {

        while (
          pendingSyncRef.current
        ) {

          pendingSyncRef.current = false;

          if (offlineRef.current) {
            break;
          }


          setSyncStatus(
            "syncing"
          );



          try {

            // UPLOAD FIRST: local changes go to cloud before any
            // download so offline edits can never be overwritten.
            // Dirty marks clear only for content identical to what
            // was uploaded (mid-push edits stay dirty).
            await pushAndClearDirty(user.id);


            // DOWNLOAD/RECONCILE: after a clean upload, pull cloud
            // additions/updates. Dirty entities are skipped inside.
            await syncCloudToLocal(user.id);


            backoffAttemptRef.current = 0;

            setSyncStatus(
              hasPendingLocalChanges() ? "pending" : "synced"
            );


          } catch(error) {


            console.error(
              "Local to cloud failed",
              error
            );


            setSyncStatus(
              "error"
            );


            scheduleRetry();

            break;

          }

        }

      } finally {


        syncingRef.current = false;


      }



    }, [
      user,
      setSyncStatus,
      scheduleRetry,
      pushAndClearDirty,
    ]);

  useEffect(() => {
    syncLocalChangesRef.current = syncLocalChanges;
  }, [syncLocalChanges]);



  useEffect(() => {


    if (!user) {


      pendingSyncRef.current = false;
      syncingRef.current = false;
      clearBackoff();
      backoffAttemptRef.current = 0;


      return;


    }


    let cancelled = false;





    async function initializeSync() {


      // Initial sync only runs when actually online. While offline,
      // the local data is already on screen; pending changes upload
      // when connectivity returns.
      if (offlineRef.current) {
        pendingSyncRef.current = true;
        setSyncStatus(
          hasPendingLocalChanges() ? "pending" : "offline"
        );
        return;
      }


      if (syncingRef.current) {
        return;
      }


      syncingRef.current = true;


      try {


        setSyncStatus(
          "syncing"
        );



        const {
          count: cloudFolderCount,
          error: folderError,

        } =
          await supabase
            .from("folders")
            .select(
              "id",
              {
                count: "exact",
                head: true,
              }
            )
            .eq(
              "user_id",
              user.id
            );



        if (folderError) {
          throw folderError;
        }




        const {
          count: cloudExamCount,
          error: examError,

        } =
          await supabase
            .from("exams")
            .select(
              "id",
              {
                count: "exact",
                head: true,
              }
            )
            .eq(
              "user_id",
              user.id
            );



        if (examError) {
          throw examError;
        }




        if (cancelled) {
          return;
        }




        const localHasData =
          getFolders().length > 0 ||
          getExams().length > 0;

        const cloudHasData =
          (cloudFolderCount || 0) > 0 ||
          (cloudExamCount || 0) > 0;

        // UPLOAD FIRST whenever there are local (dirty) changes — even
        // when the cloud has data. Pull only touches clean entities.
        if (localHasData || hasPendingLocalChanges()) {

          await pushAndClearDirty(user.id);

        }


        if (cloudHasData) {

          await syncCloudToLocal(user.id);

        }



        backoffAttemptRef.current = 0;


        if (!cancelled) {
          setSyncStatus(
            hasPendingLocalChanges() ? "pending" : "synced"
          );
        }



      } catch(error) {



        console.error(
          "Initial sync failed",
          error
        );



        if (!cancelled) {

          setSyncStatus(
            "error"
          );

        }

        scheduleRetry();

        return;


      } finally {


        syncingRef.current = false;


      }




      if (
        !cancelled &&
        pendingSyncRef.current
      ) {


        syncLocalChanges();


      }



    }





    function handleLocalChange() {


      syncLocalChanges();


    }





    window.addEventListener(
      "testbox-local-change",
      handleLocalChange
    );





    initializeSync();





    return () => {


      cancelled = true;


      window.removeEventListener(
        "testbox-local-change",
        handleLocalChange
      );


    };



  }, [
    user,
    syncLocalChanges,
    setSyncStatus,
    clearBackoff,
    scheduleRetry,
    pushAndClearDirty,
    isOffline,
  ]);



  // When connectivity returns, immediately flush pending changes.
  useEffect(() => {
    if (isOffline || !user) {
      if (isOffline && user) {
        setSyncStatus(
          hasPendingLocalChanges() ? "pending" : "offline"
        );
      }
      return;
    }

    backoffAttemptRef.current = 0;

    if (pendingSyncRef.current || hasPendingLocalChanges()) {
      syncLocalChanges();
    } else {
      setSyncStatus("synced");
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, user]);



  return null;

}


export default CloudSyncManager;
