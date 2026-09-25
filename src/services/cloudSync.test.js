import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("a clean client's upload preserves another client's folder rename", async () => {
  const source = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const dirty = {
    folders: false,
    exams: false,
    subjects: false,
    settings: false,
    tags: false,
    examData: {},
    activity: {},
    deletes: [],
  };
  let remoteFolder = { id: 1, name: "Original" };
  const uploads = [];

  function client(name, foldersDirty) {
    const context = vm.createContext({
      setStorageUser() {},
      getDirtyState: () => ({ ...dirty, folders: foldersDirty }),
      getFolders: () => [{ id: 1, name, createdAt: "2026-09-17T00:00:00Z" }],
      getExams: () => [],
      supabase: {
        from(table) {
          return {
            select() {
              return { limit: async () => ({ error: null }) };
            },
            async upsert(row) {
              assert.equal(table, "folders");
              uploads.push({ ...row });
              remoteFolder = { ...row };
              return { error: null };
            },
          };
        },
      },
    });
    vm.runInContext(source, context);
    return context;
  }

  await client("Renamed on A", true).syncLocalToCloud("test-user");
  assert.equal(remoteFolder.name, "Renamed on A");
  assert.equal(uploads.length, 1);

  await client("Original", false).syncLocalToCloud("test-user");
  assert.equal(remoteFolder.name, "Renamed on A");
  assert.equal(uploads.length, 1);
});

test("reconciliation wakes a clean client after an equal-count remote rename", async () => {
  const source = await readFile(
    new URL("../components/CloudSyncManager.jsx", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("    async function reconcile() {");
  const end = source.indexOf("    const tick =", start);
  assert.ok(start >= 0 && end > start);

  const localFolders = [{ id: 1, name: "Original" }];
  const remoteFolders = [{ id: 1, name: "Renamed on A" }];
  let wakes = 0;
  const context = vm.createContext({
    stopped: false,
    user: { id: "test-user" },
    syncingRef: { current: false },
    offlineRef: { current: false },
    navigator: { onLine: true },
    hasPendingLocalChanges: () => false,
    getFolders: () => localFolders,
    getExams: () => [],
    getSubjects: () => [],
    getTags: () => [],
    syncLocalChangesRef: { current: async () => { wakes += 1; } },
    supabase: {
      from(table) {
        return {
          select() {
            return {
              eq: async () => ({
                count: table === "folders" ? remoteFolders.length : 0,
                error: null,
              }),
            };
          },
        };
      },
    },
  });
  vm.runInContext(source.slice(start, end), context);

  assert.equal(localFolders.length, remoteFolders.length);
  assert.notEqual(localFolders[0].name, remoteFolders[0].name);
  await context.reconcile();
  assert.equal(wakes, 1, "an idle clean client must reconcile equal-count edits");

  context.syncingRef.current = true;
  await context.reconcile();
  assert.equal(wakes, 1, "do not start another cycle during an active sync");
  context.syncingRef.current = false;
  context.stopped = true;
  await context.reconcile();
  assert.equal(wakes, 1, "do not wake a disposed scheduler");
});

test("automatic two-client convergence: B adopts A's equal-count rename", async () => {
  const SERVICES = new URL("./", import.meta.url);
  const COMPONENTS = new URL("../components/", import.meta.url);

  const rawStorage = await readFile(new URL("./storage.js", SERVICES), "utf8");
  const rawCloud = await readFile(new URL("./cloudSync.js", SERVICES), "utf8");
  const managerSource = await readFile(
    new URL("CloudSyncManager.jsx", COMPONENTS),
    "utf8"
  );
  const storageSource = rawStorage.replace(/export /g, "");
  const cloudSource = rawCloud
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");

  function makeStorageSandbox() {
    const values = {};
    const sandbox = vm.createContext({
      console: { error() {} },
      localStorage: {
        getItem: (key) => values[key] ?? null,
        setItem: (key, value) => { values[key] = value; },
        removeItem: (key) => { delete values[key]; },
      },
      window: { dispatchEvent: () => {} },
      CustomEvent: class { constructor(type) { this.type = type; } },
    });
    return sandbox;
  }

  const state = { folders: new Map() };

  function makeSupabase() {
    function folderTable() {
      return {
        select() {
          return {
            limit: async () => ({ error: null }),
            eq() { return this; },
            order: async () => ({ data: [...state.folders.values()], error: null }),
          };
        },
        async upsert(row) {
          for (const entry of Array.isArray(row) ? row : [row]) {
            state.folders.set(String(entry.id), { ...entry });
          }
          return { error: null };
        },
        delete() {
          return {
            eq() {
              return {
                in: async (_column, ids) => {
                  for (const id of ids) state.folders.delete(String(id));
                  return { error: null };
                },
              };
            },
          };
        },
      };
    }

    function emptyTable() {
      const builder = {
        select() { return builder; },
        limit: async () => ({ error: null }),
        eq() { return builder; },
        order: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        async upsert() { return { error: null }; },
        delete() {
          return { eq() { return { in: async () => ({ error: null }) }; } };
        },
      };
      return builder;
    }

    return {
      from(table) {
        return table === "folders" ? folderTable() : emptyTable();
      },
    };
  }

  function makeClient() {
    const sandbox = makeStorageSandbox();
    vm.runInContext(storageSource, sandbox);
    sandbox.setStorageUser("shared-user");
    sandbox.createFolder({ id: 1, name: "Original", createdAt: "2026-09-17T00:00:00Z" });
    sandbox.clearDirtySection("folders");
    const cloud = vm.createContext({
      ...sandbox,
      supabase: makeSupabase(state),
    });
    vm.runInContext(cloudSource, cloud);
    return { sandbox, cloud };
  }

  const clientA = makeClient();
  const clientB = makeClient();
  await clientA.cloud.syncCloudToLocal("shared-user");
  clientA.sandbox.updateFolder(1, { name: "Renamed" });
  await clientA.cloud.syncLocalToCloud("shared-user");
  assert.equal([...state.folders.values()][0].name, "Renamed");

  const start = managerSource.indexOf("    async function reconcile() {");
  const end = managerSource.indexOf("    const tick =", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    stopped: false,
    user: { id: "shared-user" },
    syncingRef: { current: false },
    offlineRef: { current: false },
    navigator: { onLine: true },
    hasPendingLocalChanges: () => clientB.sandbox.hasPendingLocalChanges(),
    getFolders: () => clientB.sandbox.getFolders(),
    getExams: () => [],
    getSubjects: () => [],
    getTags: () => [],
    syncLocalChangesRef: {
      current: async () => {
        await clientB.cloud.syncLocalToCloud("shared-user");
        await clientB.cloud.syncCloudToLocal("shared-user");
      },
    },
    supabase: makeSupabase(state),
  });
  vm.runInContext(managerSource.slice(start, end), context);
  await context.reconcile();

  assert.equal(clientB.sandbox.getFolders()[0].name, "Renamed");
});

test("scoped tombstone ack: a delete recorded after the snapshot stays pending", async () => {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8")).replace(/export /g, "");
  const values = {};
  const sandbox = vm.createContext({
    console: { error() {} },
    localStorage: {
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => { values[key] = value; },
      removeItem: (key) => { delete values[key]; },
    },
    window: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  vm.runInContext(storageSource, sandbox);
  sandbox.setStorageUser("ack-user");

  sandbox.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" });
  sandbox.createFolder({ id: 11, name: "F11", createdAt: "2026-09-17T00:00:00Z" });
  sandbox.clearDirtySection("folders");

  // Snapshot: only folder 10 was pending when the push started.
  sandbox.deleteFolder(10);
  const snapshot = sandbox.getDirtyState().deletes.map((d) => ({ ...d }));

  // Mid-push: a second delete lands after the snapshot.
  sandbox.deleteFolder(11);

  // Ack exactly the snapshot (as CloudSyncManager now does).
  sandbox.markTombstonesPushed(snapshot);

  const after = sandbox.getDirtyState().deletes;
  assert.ok(after.find((d) => d.id === "10").pushedAt, "snapshot delete is acked");
  assert.equal(after.find((d) => d.id === "11").pushedAt, undefined, "post-snapshot delete stays pending");
  assert.equal(sandbox.hasPendingLocalChanges(), true, "pending work remains discoverable");
});

test("a local rename during a pending cloud pull survives and remains dirty", async () => {
  const { sandbox } = await tombstoneClient();
  sandbox.clearDirtySection("folders");
  const source = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const cloud = vm.createContext({ ...sandbox });
  vm.runInContext(source, cloud);
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  cloud.probeSchemaCapabilities = async () => {};
  cloud.getCloudFolders = () => { started(); return response; };
  cloud.getCloudExams = async () => [];
  cloud.getCloudSubjects = async () => [];
  cloud.getCloudActivity = async () => [];
  cloud.getCloudSettings = async () => null;
  cloud.getCloudTags = async () => [];
  const pull = cloud.syncCloudToLocal("tombstone-user");
  await entered;
  assert.equal(sandbox.updateFolder(10, { name: "Local edit during pull" }), true);
  release([{ id: 10, name: "Stale remote", created_at: "2026-09-17T00:00:00Z" }]);
  await pull;
  assert.equal(sandbox.getFolders()[0].name, "Local edit during pull");
  assert.equal(sandbox.getDirtyState().folders, true);
});

async function pullClient() {
  const { sandbox } = await tombstoneClient();
  sandbox.clearDirtySection("folders");
  const source = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const cloud = vm.createContext({ ...sandbox });
  vm.runInContext(source, cloud);
  cloud.probeSchemaCapabilities = async () => {};
  cloud.getCloudFolders = async () => [];
  cloud.getCloudExams = async () => [];
  cloud.getCloudSubjects = async () => [];
  cloud.getCloudActivity = async () => [];
  cloud.getCloudSettings = async () => null;
  cloud.getCloudTags = async () => [];
  return { sandbox, cloud };
}

test("a failed local pull write does not enable cloud pruning", async () => {
  const { sandbox, cloud } = await pullClient();
  cloud.saveFolders = () => false;
  await assert.rejects(cloud.syncCloudToLocal("tombstone-user"), /Failed to save cloud folders/);
  assert.equal(vm.runInContext("sessionHasPulled", cloud), false);
  assert.equal(sandbox.updateFolder(10, { name: "After failure" }), true);
  assert.equal(sandbox.getDirtyState().folders, true);
});

test("a dirty exam does not fetch remote questions that cannot be adopted", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(sandbox.createExam({ id: 20, folderId: 10, name: "Local", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }), true);
  cloud.getCloudExams = async () => [{ id: 20, folder_id: 10, name: "Remote", question_count: 1 }];
  cloud.getCloudQuestionsForExam = async () => { throw new Error("Unnecessary question request"); };
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getExams()[0].name, "Local");
});

test("a tombstoned exam is excluded from both metadata and question adoption", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(sandbox.createExam({ id: 20, folderId: 10, name: "Local", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(sandbox.deleteExam(20), true);
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("examData");
  cloud.getCloudExams = async () => [{ id: 20, folder_id: 10, name: "Remote", question_count: 1 }];
  cloud.getCloudQuestionsForExam = async () => { throw new Error("Deleted exam request"); };
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getExams().length, 0);
});

for (const mutation of ["answer", "delete"]) {
  test(`a local ${mutation} during question download is preserved`, async () => {
    const { sandbox, cloud } = await pullClient();
    assert.equal(sandbox.createExam({ id: 20, folderId: 10, name: "Local", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }), true);
    sandbox.clearDirtySection("exams");
    cloud.getCloudExams = async () => [{ id: 20, folder_id: 10, name: "Remote", question_count: 1, created_at: "2026-09-17T00:00:00Z" }];
    let release;
    let started;
    const entered = new Promise((resolve) => { started = resolve; });
    const response = new Promise((resolve) => { release = resolve; });
    cloud.getCloudQuestionsForExam = () => { started(); return response; };
    const pull = cloud.syncCloudToLocal("tombstone-user");
    await entered;
    if (mutation === "answer") {
      assert.equal(sandbox.saveExamData(20, { answers: { "1": "B" } }), true);
    } else {
      assert.equal(sandbox.deleteExam(20), true);
    }
    release([]);
    await pull;
    if (mutation === "answer") {
      assert.equal(sandbox.getExamData(20).answers["1"], "B");
      assert.equal(sandbox.getDirtyState().examData["20"], true);
    } else {
      assert.equal(sandbox.getExams().length, 0);
      assert.deepEqual(Array.from(sandbox.getDeletedIds("exam")), ["20"]);
    }
  });
}

test("a clean pull does not create pending local work", async () => {
  const { sandbox, cloud } = await pullClient();
  cloud.getCloudFolders = async () => [{ id: 10, name: "Remote", created_at: "2026-09-17T00:00:00Z" }];
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getFolders()[0].name, "Remote");
  assert.equal(sandbox.hasPendingLocalChanges(), false);
});

async function tombstoneClient() {
  const source = (await readFile(new URL("./storage.js", import.meta.url), "utf8")).replace(/export /g, "");
  const values = new Map();
  let now = 1000000;
  const sandbox = vm.createContext({
    Date: class extends Date { static now() { return now; } },
    console: { error() {} },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    window: { dispatchEvent() {} },
    CustomEvent: class {},
  });
  vm.runInContext(source, sandbox);
  sandbox.setStorageUser("tombstone-user");
  assert.equal(sandbox.createFolder({ id: 10, name: "Folder", createdAt: "2026-09-17T00:00:00Z" }), true);
  return { sandbox, advance: (ms) => { now += ms; } };
}

test("an empty or omitted acknowledgement cannot acknowledge pending deletes", async () => {
  const { sandbox } = await tombstoneClient();
  sandbox.deleteFolder(10);
  sandbox.markTombstonesPushed([]);
  assert.equal(sandbox.getDirtyState().deletes[0].pushedAt, undefined);
  sandbox.markTombstonesPushed();
  assert.equal(sandbox.getDirtyState().deletes[0].pushedAt, undefined);
});

test("a repeated delete of the same entity cannot be acknowledged by an older snapshot", async () => {
  const { sandbox } = await tombstoneClient();
  sandbox.deleteFolder(10);
  const snapshot = sandbox.getDirtyState().deletes;
  sandbox.markTombstonesPushed(snapshot);
  assert.equal(sandbox.createFolder({ id: 10, name: "Recreated", createdAt: "2026-09-17T00:00:00Z" }), true);
  sandbox.deleteFolder(10);
  sandbox.markTombstonesPushed(snapshot);
  assert.equal(sandbox.getDirtyState().deletes[0].pushedAt, undefined);
});

test("an unacknowledged delete survives eight days offline", async () => {
  const { sandbox, advance } = await tombstoneClient();
  sandbox.deleteFolder(10);
  sandbox.clearDirtySection("folders");
  advance(8 * 24 * 60 * 60 * 1000);
  assert.equal(sandbox.hasPendingLocalChanges(), true);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("folder")), ["10"]);
});

test("acknowledged delete retention starts at acknowledgement rather than deletion", async () => {
  const { sandbox, advance } = await tombstoneClient();
  sandbox.deleteFolder(10);
  sandbox.clearDirtySection("folders");
  advance(8 * 24 * 60 * 60 * 1000);
  sandbox.markTombstonesPushed(sandbox.getDirtyState().deletes);
  assert.equal(sandbox.hasPendingLocalChanges(), false);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("folder")), ["10"]);
  advance(6 * 24 * 60 * 60 * 1000);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("folder")), ["10"]);
  advance(2 * 24 * 60 * 60 * 1000);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("folder")), []);
});

test("a clean pull with a higher cloud rev adopts cloud values", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(
    sandbox.updateFolder(10, { name: "Stale local" }),
    true
  );
  sandbox.clearDirtySection("folders");
  // Enable rev capability without hitting the network probe.
  vm.runInContext(
    "schemaCapabilities.foldersRev = true; schemaCapabilities.probed = true;",
    cloud
  );
  cloud.getCloudFolders = async () => [
    { id: 10, name: "Newer cloud", created_at: "2026-09-17T00:00:00Z", rev: 5 },
  ];
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getFolders()[0].name, "Newer cloud");
  assert.equal(sandbox.getFolders()[0].rev, 5);
  assert.equal(sandbox.hasPendingLocalChanges(), false);
});

test("a clean pull with a higher local rev keeps local and re-marks dirty", async () => {
  const { sandbox, cloud } = await pullClient();
  sandbox.clearDirtySection("folders");
  vm.runInContext(
    "schemaCapabilities.foldersRev = true; schemaCapabilities.probed = true;",
    cloud
  );
  // Local ahead (rev 7) but currently clean; cloud is stale (rev 3).
  const folders = sandbox.getFolders();
  folders[0] = { ...folders[0], name: "Local ahead", rev: 7 };
  assert.equal(sandbox.saveFolders(folders), true);
  sandbox.clearDirtySection("folders");
  assert.equal(sandbox.hasPendingLocalChanges(), false);

  cloud.getCloudFolders = async () => [
    { id: 10, name: "Stale cloud", created_at: "2026-09-17T00:00:00Z", rev: 3 },
  ];
  await cloud.syncCloudToLocal("tombstone-user");

  assert.equal(sandbox.getFolders()[0].name, "Local ahead");
  assert.equal(sandbox.getFolders()[0].rev, 7);
  assert.equal(
    sandbox.getDirtyState().folders,
    true,
    "local-ahead rows must re-upload"
  );
});

test("push increments rev when the column exists", async () => {
  const { sandbox, cloud } = await pullClient();
  const folders = sandbox.getFolders();
  folders[0] = { ...folders[0], name: "Pushed", rev: 4 };
  assert.equal(sandbox.saveFolders(folders), true);

  vm.runInContext(
    "schemaCapabilities.foldersRev = true; schemaCapabilities.probed = true;",
    cloud
  );
  const uploads = [];
  cloud.supabase = {
    from(table) {
      return {
        select() {
          return { limit: async () => ({ error: null }) };
        },
        async upsert(row) {
          assert.equal(table, "folders");
          uploads.push({ ...row });
          return { error: null };
        },
      };
    },
  };
  await cloud.syncLocalToCloud("tombstone-user", {
    dirty: { ...cloud.getDirtyState(), folders: true, deletes: [] },
  });
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].rev, 5);
  assert.equal(uploads[0].name, "Pushed");
});

test("an exam config edit during question download is not overwritten by cloud", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(
    sandbox.createExam({
      id: 20,
      folderId: 10,
      name: "Local name",
      questionCount: 1,
      createdAt: "2026-09-17T00:00:00Z",
    }),
    true
  );
  sandbox.clearDirtySection("exams");
  cloud.getCloudExams = async () => [
    {
      id: 20,
      folder_id: 10,
      name: "Cloud name",
      question_count: 1,
      created_at: "2026-09-17T00:00:00Z",
    },
  ];
  let release;
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const response = new Promise((resolve) => {
    release = resolve;
  });
  cloud.getCloudQuestionsForExam = () => {
    started();
    return response;
  };
  const pull = cloud.syncCloudToLocal("tombstone-user");
  await entered;
  assert.equal(sandbox.updateExam(20, { name: "Renamed mid-pull" }), true);
  release([]);
  await pull;
  assert.equal(sandbox.getExams()[0].name, "Renamed mid-pull");
  assert.equal(sandbox.getDirtyState().exams, true);
});

test("a failed dirty write fails the folder save instead of reporting silent success", async () => {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  const values = {};
  let failDirtyWrites = false;
  const sandbox = vm.createContext({
    console: { error() {} },
    localStorage: {
      getItem: (key) => values[key] ?? null,
      setItem: (key, value) => {
        if (failDirtyWrites && key.endsWith("-dirty")) {
          throw new Error("quota exceeded");
        }
        values[key] = value;
      },
      removeItem: (key) => { delete values[key]; },
    },
    window: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  vm.runInContext(storageSource, sandbox);
  sandbox.setStorageUser("dirty-fail-user");

  // Seed a clean folder so updateFolder has a target.
  assert.equal(
    sandbox.createFolder({ id: 1, name: "Seed", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  sandbox.clearDirtySection("folders");

  failDirtyWrites = true;
  const ok = sandbox.saveFolders([{ id: 1, name: "Renamed", createdAt: "2026-09-17T00:00:00Z" }]);
  assert.equal(ok, false, "entity save must not report success when the dirty write fails");
  assert.equal(sandbox.getFolders()[0].name, "Seed", "failed save must not leave a half-applied entity");
  assert.equal(sandbox.hasPendingLocalChanges(), false, "no phantom pending state after a failed save");

  failDirtyWrites = false;
  assert.equal(
    sandbox.saveFolders([{ id: 1, name: "Renamed", createdAt: "2026-09-17T00:00:00Z" }]),
    true
  );
  assert.equal(sandbox.getFolders()[0].name, "Renamed");
  assert.equal(sandbox.hasPendingLocalChanges(), true, "successful save records durable pending work");
});

test("a user delete during pull suppression is queued and becomes pending after the pull", async () => {
  const { sandbox } = await tombstoneClient();
  sandbox.clearDirtySection("folders");
  const source = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  const cloud = vm.createContext({ ...sandbox });
  vm.runInContext(source, cloud);
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const response = new Promise((resolve) => { release = resolve; });
  cloud.probeSchemaCapabilities = async () => {};
  cloud.getCloudFolders = () => { started(); return response; };
  cloud.getCloudExams = async () => [];
  cloud.getCloudSubjects = async () => [];
  cloud.getCloudActivity = async () => [];
  cloud.getCloudSettings = async () => null;
  cloud.getCloudTags = async () => [];
  const pull = cloud.syncCloudToLocal("tombstone-user");
  await entered;

  assert.equal(sandbox.deleteFolder(10), true);
  assert.equal(
    sandbox.hasPendingLocalChanges(),
    true,
    "delete during suppression must be durably queued (not dropped)"
  );

  release([]);
  await pull;
  assert.equal(sandbox.hasPendingLocalChanges(), true, "pending delete survives the pull");
  const deletes = sandbox.getDirtyState().deletes;
  assert.ok(deletes.find((d) => d.id === "10"), "tombstone recorded for mid-pull delete");
});

test("a clean local folder missing from a non-empty cloud list is dropped (remote delete)", async () => {
  const { sandbox, cloud } = await pullClient();
  sandbox.clearDirtySection("folders");
  assert.equal(sandbox.getFolders().length, 1);
  cloud.getCloudFolders = async () => [
    { id: 99, name: "Other device folder", created_at: "2026-09-17T00:00:00Z" },
  ];
  await cloud.syncCloudToLocal("tombstone-user");
  const ids = [...sandbox.getFolders()].map((f) => String(f.id));
  assert.deepEqual(ids, ["99"], "clean local-only folder must adopt remote deletion");
  assert.equal(sandbox.hasPendingLocalChanges(), false, "adopting a remote delete is not local pending work");
});

test("a dirty local folder is not dropped when it is missing from the cloud list", async () => {
  const { sandbox, cloud } = await pullClient();
  // Re-mark dirty after pullClient's clear (simulates a local edit).
  assert.equal(sandbox.saveFolders(sandbox.getFolders()), true);
  assert.ok(sandbox.getDirtyState().folders, "save must leave folder dirty");
  cloud.getCloudFolders = async () => [
    { id: 99, name: "Other device folder", created_at: "2026-09-17T00:00:00Z" },
  ];
  await cloud.syncCloudToLocal("tombstone-user");
  const ids = [...sandbox.getFolders()].map((f) => String(f.id));
  assert.ok(ids.includes("10"), "dirty local folder must survive remote deletion adoption");
  assert.ok(ids.includes("99"), "cloud additions still apply");
});

test("an empty cloud list never mass-deletes clean local folders", async () => {
  const { sandbox, cloud } = await pullClient();
  sandbox.clearDirtySection("folders");
  cloud.getCloudFolders = async () => [];
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getFolders().length, 1, "empty cloud is ambiguous, not a mass delete");
  assert.equal(sandbox.getFolders()[0].name, "Folder");
});

test("sessionHasPulled resets when the sync user changes", async () => {
  const { cloud } = await pullClient();
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(vm.runInContext("sessionHasPulled", cloud), true);
  // Same user keeps the guard.
  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(vm.runInContext("sessionHasPulled", cloud), true);
  // A different user must not inherit the previous account's guard.
  cloud.getCloudFolders = async () => [];
  await cloud.syncCloudToLocal("other-user");
  assert.equal(
    vm.runInContext("sessionHasPulledUserId", cloud),
    "other-user",
    "pull guard is scoped to the active user"
  );
});

test("a failed restore rolls back to the pre-restore snapshot", async () => {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  let failFoldersWrite = false;
  // Keys live as own properties so storageAdapter.keys() (Object.keys)
  // matches real browser localStorage and clearAll can enumerate them.
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this, key) &&
        typeof this[key] === "string"
        ? this[key]
        : null;
    },
    setItem(key, value) {
      if (failFoldersWrite && key.endsWith("-folders")) {
        failFoldersWrite = false;
        throw new Error("quota exceeded mid-restore");
      }
      this[key] = String(value);
    },
    removeItem(key) {
      delete this[key];
    },
  };
  const sandbox = vm.createContext({
    console: { error() {}, log() {} },
    localStorage,
    window: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    Date,
  });
  vm.runInContext(storageSource, sandbox);
  sandbox.setStorageUser("restore-user");
  assert.equal(
    sandbox.createFolder({ id: 1, name: "Original", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  const backup = sandbox.createBackup();
  assert.equal(
    sandbox.saveFolders([{ id: 2, name: "Current", createdAt: "2026-09-18T00:00:00Z" }]),
    true
  );
  sandbox.clearDirtySection("folders");

  failFoldersWrite = true;
  const ok = sandbox.restoreBackup(backup);
  assert.equal(ok, false, "injected mid-restore write failure must fail the restore");
  const folders = sandbox.getFolders();
  assert.equal(folders.length, 1, "failed restore must not leave the store empty");
  assert.equal(folders[0].name, "Current", "rollback restores the pre-restore dataset");
  assert.equal(localStorage["testbox-restore-snapshot"], undefined, "snapshot key is cleaned up");
});

test("a successful restore replaces local data and marks everything dirty", async () => {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  const localStorage = {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(this, key) &&
        typeof this[key] === "string"
        ? this[key]
        : null;
    },
    setItem(key, value) {
      this[key] = String(value);
    },
    removeItem(key) {
      delete this[key];
    },
  };
  const sandbox = vm.createContext({
    console: { error() {}, log() {} },
    localStorage,
    window: { dispatchEvent: () => {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    Date,
  });
  vm.runInContext(storageSource, sandbox);
  sandbox.setStorageUser("restore-ok-user");
  assert.equal(
    sandbox.createFolder({ id: 1, name: "Old", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  const backup = sandbox.createBackup();
  sandbox.clearDirtySection("folders");
  assert.equal(sandbox.hasPendingLocalChanges(), false);

  assert.equal(sandbox.restoreBackup(backup), true);
  assert.equal(sandbox.getFolders()[0].name, "Old");
  assert.equal(sandbox.getDirtyState().folders, true, "restored data must re-upload");
  assert.equal(
    Object.prototype.hasOwnProperty.call(localStorage, "testbox-restore-snapshot"),
    false,
    "snapshot key is cleaned up after success"
  );
});

test("schema capability probe cache expires so an offline first probe can recover", async () => {
  const source = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");
  let probes = 0;
  const cloud = vm.createContext({
    console: { error() {}, log() {} },
    Date,
    supabase: {
      from() {
        return {
          select() {
            return {
              limit: async () => {
                probes += 1;
                return { error: { message: "offline" } };
              },
            };
          },
        };
      },
    },
  });
  vm.runInContext(
    source +
      "\nthis.__probe = probeSchemaCapabilities;" +
      "\nthis.__setProbedAt = (t) => { schemaProbedAt = t; };",
    cloud
  );
  await cloud.__probe();
  const afterFirst = probes;
  assert.ok(afterFirst > 0, "first probe hits the network");
  await cloud.__probe();
  assert.equal(probes, afterFirst, "within TTL the probe is cached");
  cloud.__setProbedAt(Date.now() - 6 * 60 * 1000);
  await cloud.__probe();
  assert.ok(probes > afterFirst, "expired probe must hit the network again");
});

async function durabilityHarness(userId = "durability-user") {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  const values = {};
  let failDirty = false;
  let failDirtyOnWrite = null;
  let dirtyWrites = 0;

  function makeSandbox() {
    const sandbox = vm.createContext({
      console: { error() {} },
      localStorage: {
        getItem: (key) => values[key] ?? null,
        setItem: (key, value) => {
          if (key.endsWith("-dirty")) {
            dirtyWrites += 1;
            if (failDirty || failDirtyOnWrite === dirtyWrites) {
              throw new Error("quota exceeded");
            }
          }
          values[key] = value;
        },
        removeItem: (key) => { delete values[key]; },
      },
      window: { dispatchEvent: () => {} },
      CustomEvent: class { constructor(type) { this.type = type; } },
    });
    vm.runInContext(storageSource, sandbox);
    sandbox.setStorageUser(userId);
    return sandbox;
  }

  return {
    values,
    makeSandbox,
    failDirty() { failDirty = true; },
    allowDirty() { failDirty = false; failDirtyOnWrite = null; },
    failDirtyWrite(n) { failDirtyOnWrite = n; },
    resetDirtyWrites() { dirtyWrites = 0; },
    getDirtyWriteCount() { return dirtyWrites; },
  };
}

test("removeExamData: dirty write fails → exam data is not removed", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 2, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "A" } }), true);
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("folders");

  h.failDirty();
  assert.equal(sandbox.removeExamData(20), false, "dirty failure must fail the removal");
  assert.equal(sandbox.getExamData(20).answers["1"], "A", "exam data must remain after failed removal");
  assert.equal(sandbox.getDirtyState().examData["20"], undefined, "no phantom examData dirty after failed removal");

  h.allowDirty();
  assert.equal(sandbox.removeExamData(20), true, "dirty write success allows the removal");
  assert.equal(sandbox.getExamData(20).answers["1"], undefined);
  assert.equal(sandbox.getDirtyState().examData["20"], true, "successful removal records dirty intent");
});

test("saveExamData: dirty write fails → entity write does not occur", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "A" } }), true);
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("folders");

  h.failDirty();
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "B" } }), false);
  assert.equal(sandbox.getExamData(20).answers["1"], "A", "failed save must not overwrite entity");
  assert.equal(sandbox.getDirtyState().examData["20"], undefined, "no phantom examData dirty after failed save");

  h.allowDirty();
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "B" } }), true);
  assert.equal(sandbox.getExamData(20).answers["1"], "B");
  assert.equal(sandbox.getDirtyState().examData["20"], true);
});

test("deleteFolder: intent failure prevents destructive removal", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 10, name: "E20", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  sandbox.clearDirtySection("folders");
  sandbox.clearDirtySection("exams");

  h.failDirty();
  assert.equal(sandbox.deleteFolder(10), false, "intent write failure must fail closed");
  assert.equal(sandbox.getFolders().length, 1, "folder must remain when intent recording fails");
  assert.equal(sandbox.getExams().length, 1, "child exam must remain when intent recording fails");
  assert.equal(sandbox.getDeletedIds("folder").length, 0, "no tombstone when intent write failed");

  h.allowDirty();
  assert.equal(sandbox.deleteFolder(10), true, "existing successful delete behavior unchanged");
  assert.equal(sandbox.getFolders().length, 0);
  assert.equal(sandbox.getExams().length, 0);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("folder")), ["10"]);
});

test("deleteExam: intent failure prevents destructive removal", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 10, name: "E20", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "A" } }), true);
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("examData");

  h.failDirty();
  assert.equal(sandbox.deleteExam(20), false, "intent write failure must fail closed");
  assert.equal(sandbox.getExams().length, 1, "exam must remain when intent recording fails");
  assert.equal(sandbox.getExamData(20).answers["1"], "A", "exam data must remain when intent recording fails");
  assert.equal(sandbox.getDeletedIds("exam").length, 0);

  h.allowDirty();
  assert.equal(sandbox.deleteExam(20), true);
  assert.equal(sandbox.getExams().length, 0);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("exam")), ["20"]);
});

test("deleteSubject: intent failure prevents destructive removal", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createSubject({ id: 5, name: "Math" }), true);
  sandbox.clearDirtySection("subjects");

  h.failDirty();
  assert.equal(sandbox.deleteSubject(5), false, "intent write failure must fail closed");
  assert.equal(sandbox.getSubjects().length, 1, "subject must remain when intent recording fails");

  h.allowDirty();
  assert.equal(sandbox.deleteSubject(5), true);
  assert.equal(sandbox.getSubjects().length, 0);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("subject")), ["5"]);
});

test("deleteTag: intent failure prevents removal; examData dirty failure blocks the strip", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 10, name: "E20", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.createTag({ id: 7, name: "Star" }), true);
  assert.equal(sandbox.setQuestionTag(20, 1, 7, true), true);
  sandbox.clearDirtySection("tags");
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("deletes");

  h.failDirty();
  assert.equal(sandbox.deleteTag(7), false, "intent write failure must fail closed");
  assert.equal(sandbox.getTags().length, 1, "tag must remain when intent recording fails");
  assert.equal(sandbox.getQuestionTags(20, 1)[0], 7, "question tag assignment must remain");

  // Intent (1st dirty write) succeeds; examData dirty (2nd) fails →
  // no tags/examData mutation, return false.
  h.allowDirty();
  h.resetDirtyWrites();
  h.failDirtyWrite(2);
  assert.equal(sandbox.deleteTag(7), false, "examData dirty failure must fail closed");
  assert.equal(sandbox.getTags().length, 1, "tag list must not change when examData dirty fails");
  assert.equal(sandbox.getQuestionTags(20, 1)[0], 7, "question tags must not be stripped when dirty fails");

  h.allowDirty();
  assert.equal(sandbox.deleteTag(7), true, "existing successful delete behavior unchanged");
  assert.equal(sandbox.getTags().length, 0);
  assert.equal(sandbox.getQuestionTags(20, 1).length, 0);
  assert.deepEqual(Array.from(sandbox.getDeletedIds("tag")), ["7"]);
});

test("migrateMarkedToTags: dirty write fails → examData not rewritten and migration not marked complete", async () => {
  const h = await durabilityHarness();
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 10, name: "E20", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.createTag({ id: 99, name: "__marked__" }), true);
  assert.equal(sandbox.saveExamData(20, { marked: [1], questionTags: {} }), true);
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("tags");

  h.failDirty();
  assert.equal(sandbox.migrateMarkedToTags(), false, "dirty failure reports unsuccessful migration");
  const afterFail = sandbox.getExamData(20);
  assert.deepEqual(Array.from(afterFail.marked ?? []), [1], "legacy marked list must remain");
  assert.equal(Object.keys(afterFail.questionTags).length, 0, "examData must not be rewritten when dirty fails");
  assert.equal(
    h.values["testbox-durability-user-tags-question-migrated"],
    undefined,
    "migration must not be marked complete after a dirty failure"
  );

  h.allowDirty();
  assert.equal(sandbox.migrateMarkedToTags(), true, "retry after failure must migrate");
  const afterRetry = sandbox.getExamData(20);
  assert.ok(afterRetry.questionTags["1"]?.length > 0, "marked question gains a tag on retry");
  assert.deepEqual(Array.from(afterRetry.marked ?? []), [], "legacy marked list cleared after successful migration");
  assert.ok(
    h.values["testbox-durability-user-tags-question-migrated"],
    "successful migration marks completion"
  );
  assert.equal(sandbox.migrateMarkedToTags(), false, "second run is a no-op");
});

test("migrateMarkedToTags: empty install creates no orphan __marked__ tag", async () => {
  const h = await durabilityHarness("empty-migrate");
  const sandbox = h.makeSandbox();
  assert.equal(
    sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 2, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { marked: [], questionTags: {} }), true);

  assert.equal(sandbox.migrateMarkedToTags(), false, "nothing to migrate");
  assert.equal(sandbox.getTags().length, 0, "no orphan __marked__ tag on empty data");
  assert.ok(
    h.values["testbox-empty-migrate-tags-question-migrated"],
    "migration still records completion so it does not re-scan forever"
  );
  assert.equal(sandbox.migrateMarkedToTags(), false, "second run is a no-op");
});

test("migrateMarkedToTags: marked questions create __marked__ once and stay idempotent", async () => {
  const h = await durabilityHarness("marked-migrate");
  const sandbox = h.makeSandbox();
  assert.equal(
    sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 3, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { marked: [1, 2], questionTags: {} }), true);

  assert.equal(sandbox.migrateMarkedToTags(), true, "first run migrates");
  const tagsAfterFirst = sandbox.getTags();
  assert.equal(tagsAfterFirst.length, 1, "exactly one tag created");
  assert.equal(tagsAfterFirst[0].name, "__marked__");
  const markedId = tagsAfterFirst[0].id;
  assert.deepEqual(
    Array.from(sandbox.getQuestionTags(20, 1), String),
    [String(markedId)]
  );
  assert.deepEqual(
    Array.from(sandbox.getQuestionTags(20, 2), String),
    [String(markedId)]
  );
  assert.equal(sandbox.getQuestionTags(20, 3).length, 0, "unmarked question untouched");
  assert.deepEqual(Array.from(sandbox.getExamData(20).marked ?? []), [], "legacy marked list cleared after migration");

  delete h.values["testbox-marked-migrate-tags-question-migrated"];
  assert.equal(sandbox.migrateMarkedToTags(), false, "re-run with flag cleared is a safe no-op for tags");
  assert.equal(sandbox.getTags().length, 1, "no duplicate __marked__ tag");
  assert.equal(
    sandbox.getQuestionTags(20, 1).length,
    1,
    "re-migrate does not duplicate the assignment"
  );
});

test("migrateMarkedToTags: only still-existing tags are copied from exam.tagIds", async () => {
  const h = await durabilityHarness("tagids-migrate");
  const sandbox = h.makeSandbox();
  assert.equal(
    sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.createTag({ id: 5, name: "Live" }), true);
  assert.equal(
    sandbox.createExam({
      id: 20,
      folderId: 1,
      name: "E",
      questionCount: 1,
      createdAt: "2026-09-17T00:00:00Z",
      tagIds: [5, 77],
    }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { marked: [], questionTags: {} }), true);

  assert.equal(sandbox.migrateMarkedToTags(), true, "live tag is migrated");
  assert.deepEqual(
    Array.from(sandbox.getQuestionTags(20, 1), String),
    ["5"],
    "deleted/unknown tag 77 is not copied"
  );
  assert.equal(sandbox.getTags().length, 1, "no orphan tags created");
});

test("deleteTag: strips exam.tagIds; re-migrate after flag loss cannot resurrect the tag", async () => {
  const h = await durabilityHarness("delete-migrate");
  const sandbox = h.makeSandbox();
  assert.equal(
    sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(
    sandbox.createExam({
      id: 20,
      folderId: 1,
      name: "E",
      questionCount: 2,
      createdAt: "2026-09-17T00:00:00Z",
      tagIds: [7],
    }),
    true
  );
  assert.equal(sandbox.createTag({ id: 7, name: "Doomed" }), true);
  assert.equal(sandbox.setQuestionTag(20, 1, 7, true), true);
  assert.equal(sandbox.setQuestionTag(20, 2, 7, true), true);
  sandbox.clearDirtySection("tags");
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("exams");

  assert.equal(sandbox.deleteTag(7), true, "delete succeeds");
  assert.equal(sandbox.getTags().length, 0);
  assert.equal(sandbox.getQuestionTags(20, 1).length, 0, "question assignment stripped");
  assert.equal(sandbox.getQuestionTags(20, 2).length, 0, "all questions stripped");
  const afterDelete = sandbox.getExams().find((e) => String(e.id) === "20");
  assert.ok(
    !Array.isArray(afterDelete.tagIds) ||
      !afterDelete.tagIds.some((id) => String(id) === "7"),
    "exam.tagIds no longer references the deleted tag"
  );
  assert.equal(sandbox.getDirtyState().exams, true, "exam row marked dirty for sync");

  // Simulate flag loss (clearAll/restore) then re-run migration.
  delete h.values["testbox-delete-migrate-tags-question-migrated"];
  assert.equal(sandbox.migrateMarkedToTags(), false, "re-migrate has nothing live to copy");
  assert.equal(sandbox.getQuestionTags(20, 1).length, 0, "deleted tag is not resurrected");
  assert.equal(sandbox.getQuestionTags(20, 2).length, 0, "deleted tag is not resurrected on any question");
  assert.equal(sandbox.getTags().length, 0, "deleted tag stays deleted");
});

test("setQuestionTag: assign/unassign persists across reload without duplicates", async () => {
  const h = await durabilityHarness("assign-reload");
  const first = h.makeSandbox();
  assert.equal(
    first.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(
    first.createExam({ id: 20, folderId: 1, name: "E", questionCount: 2, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(first.createTag({ id: 7, name: "Star" }), true);
  assert.equal(first.saveExamData(20, { answers: { "1": "A" }, marked: [2], note: "keep" }), true);
  assert.equal(first.setQuestionTag(20, 1, 7, true), true);
  assert.equal(first.setQuestionTag(20, 1, 7, true), true, "re-assign is idempotent");

  const reloaded = h.makeSandbox();
  assert.deepEqual(
    Array.from(reloaded.getQuestionTags(20, 1), String),
    ["7"],
    "assignment survives reload"
  );
  assert.equal(reloaded.getQuestionTags(20, 1).length, 1, "no duplicate id after idempotent re-assign");

  assert.equal(reloaded.setQuestionTag(20, 1, 7, false), true, "unassign succeeds");
  const afterUnassign = h.makeSandbox();
  assert.equal(afterUnassign.getQuestionTags(20, 1).length, 0, "unassign persists across reload");
  const data = afterUnassign.getExamData(20);
  assert.equal(data.answers["1"], "A", "answers untouched by tag ops");
  assert.deepEqual(Array.from(data.marked), [2], "marked list untouched by tag ops");
  assert.equal(data.note, "keep", "note untouched by tag ops");
});

test("createTag/updateTag: reject duplicate names case-insensitively; repeated create does not duplicate", async () => {
  const h = await durabilityHarness("dup-name");
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createTag({ id: 1, name: "Math" }), true);
  assert.equal(sandbox.createTag({ id: 2, name: "Math" }), false, "same name rejected");
  assert.equal(sandbox.createTag({ id: 3, name: "  math  " }), false, "trimmed + case-insensitive reject");
  assert.equal(sandbox.createTag({ id: 4, name: "PHYS" }), true, "different name allowed");
  assert.equal(sandbox.getTags().length, 2, "repeated create attempts do not duplicate");

  assert.equal(sandbox.updateTag(4, { name: "Math" }), false, "rename onto existing name rejected");
  assert.equal(sandbox.updateTag(4, { name: "physics" }), true, "rename to free name works");
  assert.equal(sandbox.updateTag(4, { name: "PHYSICS" }), true, "same-name update of self is allowed");
  assert.equal(sandbox.getTags().length, 2);
});

test("suppressed ops survive a reload and flush exactly once", async () => {
  const h = await durabilityHarness("reload-user");
  const first = h.makeSandbox();
  assert.equal(first.createFolder({ id: 10, name: "F10", createdAt: "2026-09-17T00:00:00Z" }), true);
  first.clearDirtySection("folders");

  first.setDirtySuppression(true);
  assert.equal(first.deleteFolder(10), true, "delete during suppression queues intent");
  assert.ok(first.getSuppressedOpCount() > 0, "ops are counted while suppressed");
  assert.ok(h.values["testbox-suppressed-ops"], "queue is persisted under the fixed key");
  assert.equal(first.hasPendingLocalChanges(), true, "pending detection sees the queue during suppression");
  first.clearDirtySection("folders");
  first.clearDirtySection("deletes");

  // Simulated process death: fresh module state, same localStorage.
  const reloaded = h.makeSandbox();
  assert.equal(reloaded.getSuppressedOpCount() > 0, true, "queue rehydrates from disk after reload");
  assert.equal(reloaded.hasPendingLocalChanges(), true, "pending detection sees persisted queue after reload");
  assert.equal(reloaded.getSuppressedOpCount(), 0, "flush empties the queue");
  assert.equal(reloaded.getDeletedIds("folder").includes("10"), true, "tombstone applied from flushed queue");
  assert.equal(reloaded.getDirtyState().folders, true, "owner mark applied from flushed queue");

  const genAfterFlush = reloaded.getDirtyState().deletes.find((d) => d.id === "10")?.generation;
  reloaded.hasPendingLocalChanges();
  reloaded.getDirtyState();
  reloaded.hasPendingLocalChanges();
  assert.equal(reloaded.getSuppressedOpCount(), 0, "repeat reads do not re-enqueue");
  assert.equal(
    reloaded.getDirtyState().deletes.find((d) => d.id === "10")?.generation,
    genAfterFlush,
    "queue is not flushed twice (generation does not bump again)"
  );
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "empty queue key is removed");
});

test("suppressed ops flush when suppression ends on the same process", async () => {
  const h = await durabilityHarness("flush-end-user");
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(sandbox.saveExamData(20, { answers: { "1": "A" } }), true);
  sandbox.clearDirtySection("examData");

  sandbox.setDirtySuppression(true);
  assert.equal(sandbox.removeExamData(20), true, "removal during suppression queues intent");
  assert.equal(sandbox.getSuppressedOpCount() > 0, true, "mark during suppression is queued");
  assert.equal(sandbox.getDirtyState().examData["20"], undefined, "dirty registry not written while suppressed");
  assert.equal(sandbox.getExamData(20).answers["1"], undefined, "entity removed while suppressed");

  sandbox.setDirtySuppression(false);
  assert.equal(sandbox.getSuppressedOpCount(), 0, "suppression end flushes the queue");
  assert.equal(sandbox.getDirtyState().examData["20"], true, "flushed mark is durable");
  sandbox.setDirtySuppression(false);
  assert.equal(sandbox.getSuppressedOpCount(), 0, "second lift is a no-op");
  assert.equal(sandbox.getDirtyState().examData["20"], true, "repeated lifts do not clear dirty state");
});

test("malformed or partial suppressed-ops payloads are ignored safely", async () => {
  const h = await durabilityHarness("malformed-user");

  h.values["testbox-suppressed-ops"] = "not-json{{{";
  const badJson = h.makeSandbox();
  assert.equal(badJson.getSuppressedOpCount(), 0, "malformed JSON yields an empty queue");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "malformed key is removed");
  assert.equal(badJson.hasPendingLocalChanges(), false);

  h.values["testbox-suppressed-ops"] = JSON.stringify({ not: "an array" });
  const notArray = h.makeSandbox();
  assert.equal(notArray.getSuppressedOpCount(), 0, "non-array payload yields an empty queue");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "non-array key is removed");

  h.values["testbox-suppressed-ops"] = JSON.stringify([
    { kind: "nope" },
    { kind: "mark", section: "" },
    { kind: "delete", type: "", id: "" },
    { kind: "mark", section: "folders" },
  ]);
  const filtered = h.makeSandbox();
  assert.equal(filtered.getSuppressedOpCount(), 1, "invalid entries are dropped; valid ones kept");
  assert.equal(filtered.hasPendingLocalChanges(), true, "valid remaining op still counts as pending");
  assert.equal(filtered.getSuppressedOpCount(), 0, "valid op flushes");
  assert.equal(filtered.getDirtyState().folders, true);
});

test("removeExamData and saveExamData keep dirty-first when suppression is off (success path)", async () => {
  const h = await durabilityHarness("success-path-user");
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  sandbox.clearDirtySection("examData");

  assert.equal(sandbox.saveExamData(20, { answers: { "1": "A" } }), true);
  assert.equal(sandbox.getDirtyState().examData["20"], true, "successful save records dirty intent first");
  sandbox.clearDirtySection("examData");

  assert.equal(sandbox.removeExamData(20), true);
  assert.equal(sandbox.getDirtyState().examData["20"], true, "successful removal records dirty intent");
});

test("saveExamData during suppression survives reload and flushes exactly once", async () => {
  const h = await durabilityHarness("save-suppress-user");
  const first = h.makeSandbox();
  assert.equal(first.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    first.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  assert.equal(first.saveExamData(20, { answers: { "1": "A" } }), true);
  first.clearDirtySection("examData");

  first.setDirtySuppression(true);
  assert.equal(first.saveExamData(20, { answers: { "1": "B" } }), true, "user save under suppression succeeds");
  assert.ok(first.getSuppressedOpCount() > 0, "save is queued while suppressed");
  assert.equal(first.getDirtyState().examData["20"], undefined, "dirty registry not written while suppressed");
  assert.equal(first.getExamData(20).answers["1"], "B", "entity write still lands");

  // Process death before suppression ends: fresh module, same localStorage.
  const reloaded = h.makeSandbox();
  assert.ok(reloaded.getSuppressedOpCount() > 0, "pending save op survives reload");
  assert.equal(reloaded.hasPendingLocalChanges(), true, "reloaded pending detection sees the queued save");
  assert.equal(reloaded.getSuppressedOpCount(), 0, "flush empties the queue");
  assert.equal(reloaded.getDirtyState().examData["20"], true, "flushed examData mark is durable");
  assert.equal(reloaded.getExamData(20).answers["1"], "B", "entity value unchanged by flush");

  reloaded.hasPendingLocalChanges();
  reloaded.getDirtyState();
  assert.equal(reloaded.getSuppressedOpCount(), 0, "repeat reads do not re-enqueue");
  assert.equal(reloaded.getDirtyState().examData["20"], true, "second flush does not clear or duplicate dirty");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "empty queue key removed after flush");
});

test("folder rename during suppression survives reload and flushes exactly once", async () => {
  const h = await durabilityHarness("rename-suppress-user");
  const first = h.makeSandbox();
  assert.equal(first.createFolder({ id: 1, name: "Original", createdAt: "2026-09-17T00:00:00Z" }), true);
  first.clearDirtySection("folders");

  first.setDirtySuppression(true);
  assert.equal(first.updateFolder(1, { name: "Renamed" }), true, "rename under suppression succeeds");
  assert.ok(first.getSuppressedOpCount() > 0, "rename is queued while suppressed");
  assert.equal(first.getDirtyState().folders, false, "dirty registry not written while suppressed");
  assert.equal(first.getFolders()[0].name, "Renamed", "entity rename lands");

  const reloaded = h.makeSandbox();
  assert.ok(reloaded.getSuppressedOpCount() > 0, "pending rename op survives reload");
  reloaded.hasPendingLocalChanges();
  assert.equal(reloaded.getSuppressedOpCount(), 0, "flush empties the queue");
  assert.equal(reloaded.getDirtyState().folders, true, "flushed folder mark is durable");
  assert.equal(reloaded.getFolders()[0].name, "Renamed");

  reloaded.hasPendingLocalChanges();
  assert.equal(reloaded.getSuppressedOpCount(), 0, "repeat flush does not re-enqueue");
  assert.equal(reloaded.getDirtyState().folders, true, "repeated flush does not clear dirty");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "empty queue key removed");
});

test("cloud-wrapped save during suppression does not enqueue (pull must stay clean)", async () => {
  const h = await durabilityHarness("cloud-save-user");
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    sandbox.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  sandbox.clearDirtySection("examData");
  sandbox.clearDirtySection("folders");

  sandbox.setDirtySuppression(true);
  sandbox.beginCloudWrite();
  try {
    assert.equal(sandbox.saveExamData(20, { answers: { "1": "C" } }), true);
    assert.equal(sandbox.saveFolders([{ id: 1, name: "Pulled", createdAt: "2026-09-17T00:00:00Z" }]), true);
  } finally {
    sandbox.endCloudWrite();
  }
  assert.equal(sandbox.getSuppressedOpCount(), 0, "cloud writes must not enqueue");
  assert.equal(sandbox.getFolders()[0].name, "Pulled");
  assert.equal(sandbox.getExamData(20).answers["1"], "C");
  sandbox.setDirtySuppression(false);
  assert.equal(sandbox.getSuppressedOpCount(), 0, "lift after cloud writes stays empty");
  assert.equal(sandbox.getDirtyState().examData["20"], undefined, "clean pull still creates no pending work");
  assert.equal(sandbox.getDirtyState().folders, false, "clean pull does not re-mark folders");
});

test("repeated reload+flush does not duplicate dirty operations", async () => {
  const h = await durabilityHarness("dup-user");
  const first = h.makeSandbox();
  assert.equal(first.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  first.clearDirtySection("folders");

  first.setDirtySuppression(true);
  assert.equal(first.updateFolder(1, { name: "Edited" }), true);
  const queued = JSON.parse(h.values["testbox-suppressed-ops"]);
  assert.equal(queued.length, 1, "exactly one op queued for one rename");
  assert.equal(queued[0].userId, "dup-user", "new ops are stamped with the originating user");

  const reloaded = h.makeSandbox();
  reloaded.hasPendingLocalChanges();
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "queue key removed after first flush");

  const reloaded2 = h.makeSandbox();
  reloaded2.hasPendingLocalChanges();
  reloaded2.getDirtyState();
  assert.equal(reloaded2.getSuppressedOpCount(), 0, "second reload has nothing left to flush");
  assert.equal(reloaded2.getDirtyState().folders, true, "dirty mark remains a single durable true");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "no re-enqueue after second reload");
});

test("suppressed ops from another account are retained and not applied under the active user", async () => {
  const h = await durabilityHarness("account-a");
  const a = h.makeSandbox();
  assert.equal(a.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" }), true);
  assert.equal(
    a.createExam({ id: 20, folderId: 1, name: "E", questionCount: 1, createdAt: "2026-09-17T00:00:00Z" }),
    true
  );
  a.clearDirtySection("examData");
  a.clearDirtySection("folders");

  a.setDirtySuppression(true);
  assert.equal(a.saveExamData(20, { answers: { "1": "A" } }), true);
  assert.ok(a.getSuppressedOpCount() > 0, "account A has queued work");

  // Account switch mid-queue without lifting suppression.
  a.setStorageUser("account-b");
  assert.equal(a.getSuppressedOpCount(), 0, "account B does not see A's ops");
  assert.equal(a.hasPendingLocalChanges(), false, "A's queue is not pending work for B");

  a.setDirtySuppression(false); // lift under B — must not apply A's ops
  assert.equal(a.getSuppressedOpCount(), 0, "still nothing for B after lift");
  assert.equal(a.getDirtyState().examData["20"], undefined, "B's dirty registry untouched by A's save");
  assert.equal(a.getDirtyState().folders, false, "B's folder dirty untouched");
  assert.ok(h.values["testbox-suppressed-ops"], "A's ops are retained, not dropped");
  assert.equal(
    a.getFolders()[0]?.name,
    undefined,
    "B's entity space has no folder 1 (isolation)"
  );

  // Original user returns — retained ops flush normally.
  a.setStorageUser("account-a");
  assert.ok(a.getSuppressedOpCount() > 0, "retained ops become visible when A returns");
  assert.equal(a.hasPendingLocalChanges(), true, "pending detection sees A's retained ops");
  assert.equal(a.getSuppressedOpCount(), 0, "flush empties A's queue");
  assert.equal(a.getDirtyState().examData["20"], true, "A's save flushes under A");
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "queue cleared after owner flush");
});

test("legacy suppressed ops without userId flush under the current account", async () => {
  const h = await durabilityHarness("legacy-current-user");
  h.values["testbox-suppressed-ops"] = JSON.stringify([
    { kind: "mark", section: "folders" },
    { kind: "mark", section: "exams", userId: "someone-else" },
  ]);
  const sandbox = h.makeSandbox();
  assert.equal(sandbox.getSuppressedOpCount(), 1, "only legacy + current-user ops count");
  assert.equal(sandbox.hasPendingLocalChanges(), true);
  assert.equal(sandbox.getSuppressedOpCount(), 0, "after flush only foreign op remains (not counted for current user)");
  assert.equal(sandbox.getDirtyState().folders, true, "legacy op applies to current user");
  assert.equal(sandbox.getDirtyState().exams, false, "foreign op is not applied");
  const retained = JSON.parse(h.values["testbox-suppressed-ops"]);
  assert.equal(retained.length, 1, "foreign op still retained on disk");
  assert.equal(retained[0].userId, "someone-else");

  sandbox.setStorageUser("someone-else");
  assert.equal(sandbox.getSuppressedOpCount(), 1, "foreign still retained on disk");
  sandbox.setStorageUser("someone-else");
  assert.equal(sandbox.getSuppressedOpCount(), 1, "foreign still visible to its owner");
  sandbox.hasPendingLocalChanges();
  assert.equal(sandbox.getDirtyState().exams, true, "owner flush applies their op");
  assert.equal(sandbox.getSuppressedOpCount(), 0);
  assert.equal(h.values["testbox-suppressed-ops"], undefined, "queue empty after both owners flushed");
});

// =========================================================
// Active exam lifecycle: examState must survive push + pull
// =========================================================

test("dirty examData alone still uploads the exam row (exam_state path)", async () => {
  const storageSource = (await readFile(new URL("./storage.js", import.meta.url), "utf8"))
    .replace(/export /g, "");
  const cloudSource = (await readFile(new URL("./cloudSync.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from ["'][^"']+["'];/gm, "")
    .replace(/export /g, "");

  const values = new Map();
  const examUpserts = [];
  const sandbox = vm.createContext({
    console: { error() {} },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    window: { dispatchEvent() {} },
    CustomEvent: class {},
  });
  vm.runInContext(storageSource, sandbox);
  sandbox.setStorageUser("exam-state-user");
  sandbox.createFolder({ id: 1, name: "F", createdAt: "2026-09-17T00:00:00Z" });
  sandbox.createExam({
    id: 20,
    folderId: 1,
    name: "E",
    type: "exam",
    questionCount: 1,
    createdAt: "2026-09-17T00:00:00Z",
  });
  sandbox.clearDirtySection("folders");
  sandbox.clearDirtySection("exams");

  // Start attempt: only marks dirty.examData (ExamStart path)
  const active = { status: "in_progress", startedAt: 1, remainingSeconds: 3600 };
  assert.equal(sandbox.saveExamData(20, { ...sandbox.getExamData(20), examState: active }), true);
  assert.equal(sandbox.getDirtyState().examData["20"], true);
  assert.equal(sandbox.getDirtyState().exams, false, "saveExamData alone does not dirty exams");

  const cloud = vm.createContext({
    ...sandbox,
    supabase: {
      from(table) {
        if (table === "folders") {
          return {
            select() {
              return {
                limit: async () => ({ error: null }),
                eq() { return this; },
                order: async () => ({ data: [], error: null }),
              };
            },
            async upsert() { return { error: null }; },
          };
        }
        if (table === "exams") {
          return {
            select() {
              const b = {
                limit: async () => ({ error: null }),
                eq() { return b; },
                order: async () => ({ data: [], error: null }),
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return b;
            },
            async upsert(row) {
              examUpserts.push({ ...row });
              return { error: null };
            },
          };
        }
        if (table === "exam_questions") {
          return {
            select() {
              const b = {
                limit: async () => ({ error: null }),
                eq() { return b; },
                order: async () => ({ data: [], error: null }),
              };
              return b;
            },
            async upsert() { return { error: null }; },
            delete() {
              return { eq() { return { eq() { return { in: async () => ({ error: null }) }; } }; } };
            },
          };
        }
        return {
          select() {
            const b = {
              limit: async () => ({ error: null }),
              eq() { return b; },
              order: async () => ({ data: [], error: null }),
            };
            return b;
          },
          async upsert() { return { error: null }; },
        };
      },
    },
  });
  vm.runInContext(cloudSource, cloud);
  cloud.probeSchemaCapabilities = async () => {};
  vm.runInContext(
    "schemaCapabilities.probed = true; schemaCapabilities.examsExamState = true; schemaCapabilities.examsType = true;",
    cloud
  );

  const dirty = sandbox.getDirtyState();
  await cloud.syncLocalToCloud("exam-state-user", { dirty });

  assert.ok(examUpserts.length >= 1, "exam row must upload when only examData is dirty");
  // JSON round-trip: exam_state was built inside the VM realm, so its
  // prototype is not Object.prototype in this context.
  assert.deepEqual(
    JSON.parse(JSON.stringify(examUpserts[0].exam_state)),
    active,
    "exam_state rides on the exam row upload"
  );
});

test("pull with cloud exam_state null preserves local in_progress attempt", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(
    sandbox.createExam({
      id: 20,
      folderId: 10,
      name: "Local",
      type: "exam",
      questionCount: 1,
      createdAt: "2026-09-17T00:00:00Z",
    }),
    true
  );
  const active = { status: "in_progress", startedAt: 1, remainingSeconds: 3600 };
  assert.equal(
    sandbox.saveExamData(20, { ...sandbox.getExamData(20), examState: active }),
    true
  );
  // Clear dirty so the pull is allowed to adopt the (stale) cloud row —
  // this is the exact window that used to null examState.
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("examData");

  vm.runInContext(
    "schemaCapabilities.probed = true; schemaCapabilities.examsExamState = true; schemaCapabilities.examsType = true;",
    cloud
  );
  cloud.getCloudExams = async () => [
    {
      id: 20,
      folder_id: 10,
      name: "Local",
      question_count: 1,
      created_at: "2026-09-17T00:00:00Z",
      exam_state: null,
    },
  ];
  cloud.getCloudQuestionsForExam = async () => [];

  await cloud.syncCloudToLocal("tombstone-user");

  const after = sandbox.getExamData(20);
  assert.equal(after.examState?.status, "in_progress", "local in_progress must survive a null cloud exam_state");
  assert.deepEqual(
    JSON.parse(JSON.stringify(after.examState)),
    active,
    "examState payload unchanged"
  );
});

test("pull with cloud completed still wins over local in_progress (finish is terminal)", async () => {
  const { sandbox, cloud } = await pullClient();
  assert.equal(
    sandbox.createExam({
      id: 20,
      folderId: 10,
      name: "Local",
      type: "exam",
      questionCount: 1,
      createdAt: "2026-09-17T00:00:00Z",
    }),
    true
  );
  assert.equal(
    sandbox.saveExamData(20, {
      ...sandbox.getExamData(20),
      examState: { status: "in_progress", startedAt: 1 },
    }),
    true
  );
  sandbox.clearDirtySection("exams");
  sandbox.clearDirtySection("examData");

  vm.runInContext(
    "schemaCapabilities.probed = true; schemaCapabilities.examsExamState = true; schemaCapabilities.examsType = true;",
    cloud
  );
  const completed = { status: "completed", startedAt: 1, finishedAt: 2 };
  cloud.getCloudExams = async () => [
    {
      id: 20,
      folder_id: 10,
      name: "Local",
      question_count: 1,
      created_at: "2026-09-17T00:00:00Z",
      exam_state: completed,
    },
  ];
  cloud.getCloudQuestionsForExam = async () => [];

  await cloud.syncCloudToLocal("tombstone-user");
  assert.equal(sandbox.getExamData(20).examState?.status, "completed");
});
