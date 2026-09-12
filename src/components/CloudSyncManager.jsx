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
  markTombstonesPushed,
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

// Periodic reconciliation watchdog interval. Long enough to stay cheap
// (the online path is 2-4 HEAD count probes), short enough that a
// missed event self-heals. Reconnect/visibility/local-mutation all
// trigger sync immediately; this is the backstop.
const WORK_CHECK_INTERVAL_MS = 3 * 60 * 1000;

function computeBackoffMs(attempt) {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

function CloudSyncManager() {

  const { user, isOffline } = useAuth();

  const {
    syncStatus,
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

    // Tombstone ack: the push applied every cloud delete (idempotent).
    // Tombstones themselves persist (TTL) so pulls keep filtering, but
    // they stop counting as pending here.
    if (dirty.deletes.length > 0) {
      markTombstonesPushed();
    }

    // Tombstones are deliberately NOT cleared after a push. They persist
    // until their 7-day TTL expires (pruned lazily on dirty reads) so a
    // device that was offline during a delete window keeps filtering the
    // deleted ids out of every pull instead of resurrecting them.
    // Re-pushing tombstones is safe: cloud deletes are idempotent.
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

  const scheduleRetryRef = useRef(null);

  const scheduleRetry = useCallback(() => {
    clearBackoff();
    const delay = computeBackoffMs(backoffAttemptRef.current);
    backoffAttemptRef.current = Math.min(backoffAttemptRef.current + 1, 20);
    backoffTimerRef.current = setTimeout(() => {
      backoffTimerRef.current = null;
      // Durability-first: "is there work" is decided by the DURABLE
      // dirty registry, not only the ephemeral in-memory flag the sync
      // loop consumes at iteration start. (The old check used
      // pendingSyncRef alone — after a failed cycle it was false and
      // the retry became a silent no-op, stranding pending work until
      // an unrelated event kicked the scheduler. Root cause of
      // "manual sync works, automatic sync doesn't".)
      const hasWork = pendingSyncRef.current || hasPendingLocalChanges();
      if (!hasWork) {
        return;
      }
      if (!offlineRef.current) {
        syncLocalChangesRef.current?.();
      } else {
        // Offline with pending work: keep the chain alive so recovery
        // is self-healing even if no connectivity transition ever
        // fires (dead gateway keeps navigator.onLine true; the probe
        // result is cached per page load). Capped so it never spins.
        scheduleRetryRef.current?.();
      }
    }, delay);
  }, [clearBackoff]);

  useEffect(() => {
    scheduleRetryRef.current = scheduleRetry;
  }, [scheduleRetry]);



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



  // Periodic reconciliation watchdog (architecture fix, not a poll-for-
  // polling's-sake loop): the durable dirty registry is the source of
  // truth for "is there work", and the scheduler state is ephemeral
  // (event listeners can be torn down by remounts, window events can be
  // missed entirely). One central tick closes the gap:
  //   - pending durable work → kick the same sync cycle manual sync
  //     uses (identical engine, no second sync implementation)
  //   - otherwise            → cheap count probe (4 HEAD requests);
  //     pull only when cloud/local counts differ — cross-device
  //     convergence without the other device pressing anything
  useEffect(() => {
    if (!user) return undefined;

    let stopped = false;

    async function reconcile() {
      if (stopped || !user || syncingRef.current) return;
      if (offlineRef.current || navigator.onLine === false) return;
      if (hasPendingLocalChanges()) {
        syncLocalChangesRef.current?.();
        return;
      }
      // No local work: probe cloud counts vs local. Equal → idle.
      try {
        const uid = user.id;
        const probe = async (table) => {
          const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid);
          return error ? null : count ?? 0;
        };
        const [cloudFolders, cloudExams, cloudSubjects, cloudTags] =
          await Promise.all([
            probe("folders"),
            probe("exams"),
            // Missing tables probe as null → treated as "unknown", not
            // a difference; no resurrection risk from a failed probe.
            probe("subjects"),
            probe("tags"),
          ]);
        if (cloudFolders === null && cloudExams === null) return;
        const localFolders = getFolders().length;
        const localExams = getExams().length;
        const localSubjects = getSubjects().length;
        const localTags = getTags().length;
        const differs =
          (cloudFolders !== null && cloudFolders !== localFolders) ||
          (cloudExams !== null && cloudExams !== localExams) ||
          (cloudSubjects !== null && cloudSubjects !== localSubjects) ||
          (cloudTags !== null && cloudTags !== localTags);
        if (differs && !stopped) {
          syncLocalChangesRef.current?.();
        }
      } catch {
        // reconciliation is opportunistic; next tick retries
      }
    }

    const tick = () => reconcile();
    const interval = setInterval(tick, WORK_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const onOnline = () => tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    tick();

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [user]);



  // Dev/QA observability: a safe, secret-free snapshot of the sync
  // pipeline so failures can be diagnosed from state, not guesses.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    try {
      window.__testboxSyncDebug = () => {
        const d = getDirtyState();
        const pendingTypes = Object.entries({
          folders: d.folders,
          exams: d.exams,
          subjects: d.subjects,
          settings: d.settings,
          tags: d.tags,
          examData: Object.keys(d.examData).length,
          activity: Object.keys(d.activity).length,
          deletes: d.deletes.length,
        }).filter(([, v]) => v === true || (typeof v === "number" && v > 0));
        return {
          status: syncStatus,
          pendingTypes,
          retry: backoffAttemptRef.current,
          offline: offlineRef.current,
        };
      };
    } catch {
      // observability must never break sync
    }
  });



  return null;

}


export default CloudSyncManager;
