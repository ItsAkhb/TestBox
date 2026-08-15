import {
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useAuth } from "../context/AuthContext";

import {
  getFolders,
  getExams,
  setStorageUser,
} from "../services/dataService";

import {
  syncLocalToCloud,
  syncCloudToLocal,
} from "../services/cloudSync";

import { supabase } from "../services/supabaseClient";

import { useSync } from "../context/SyncContext";


function CloudSyncManager() {

  const { user } = useAuth();

  const {
    setSyncStatus,
  } = useSync();


  const syncingRef =
    useRef(false);

  const pendingSyncRef =
    useRef(false);




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






  const syncLocalChanges =
    useCallback(async () => {

      if (!user) {
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



          const folders =
            getFolders();


          const exams =
            getExams();



          const hasLocalData =
            folders.length > 0 ||
            exams.length > 0;



          if (!hasLocalData) {

            setSyncStatus(
              "synced"
            );

            continue;

          }




          setSyncStatus(
            "syncing"
          );



          try {


            console.log(
              "LOCAL → CLOUD START"
            );



            await syncLocalToCloud(
              user.id
            );



            console.log(
              "LOCAL → CLOUD FINISHED"
            );



            setSyncStatus(
              "synced"
            );



          } catch(error) {


            console.error(
              "Local to cloud failed",
              error
            );


            setSyncStatus(
              "error"
            );


          }


        }



      } finally {


        syncingRef.current = false;


      }



    }, [
      user,
      setSyncStatus,
    ]);









  useEffect(() => {


    if (!user) {


      pendingSyncRef.current = false;

      syncingRef.current = false;


      return;


    }



    let cancelled = false;






    async function initializeSync() {



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





        if (cloudHasData) {



          console.log(
            "CLOUD → LOCAL START"
          );



          await syncCloudToLocal(
            user.id
          );



          console.log(
            "CLOUD → LOCAL FINISHED"
          );




        } else if (localHasData) {



          console.log(
            "LOCAL → CLOUD INITIAL START"
          );



          await syncLocalToCloud(
            user.id
          );



          console.log(
            "LOCAL → CLOUD INITIAL FINISHED"
          );




        } else {


          console.log(
            "NOTHING TO SYNC"
          );


        }




      } catch(error) {



        console.error(
          "Initial sync failed",
          error
        );



        setSyncStatus(
          "error"
        );



        return;



      } finally {



        syncingRef.current = false;



        setSyncStatus(
          "synced"
        );



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
  ]);





  return null;

}


export default CloudSyncManager;