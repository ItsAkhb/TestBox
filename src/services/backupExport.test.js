import test from "node:test";
import assert from "node:assert/strict";

import { backupFilename, saveBackup } from "./backupExport.js";

test("backup filename keeps the testbox-backup-YYYY-MM-DD convention", () => {
  const now = new Date("2026-09-29T10:30:00.000Z");
  assert.equal(backupFilename(now), "testbox-backup-2026-09-29.json");
});

test("web export downloads once and never touches the native saver", async () => {
  const calls = [];
  const mode = await saveBackup({
    json: '{"a":1}',
    filename: "testbox-backup-2026-09-29.json",
    isNative: () => false,
    nativeSaver: async () => {
      throw new Error("native saver must not run on web");
    },
    webDownloader: (json, filename) => calls.push({ json, filename }),
  });

  assert.equal(mode, "web");
  assert.deepEqual(calls, [
    { json: '{"a":1}', filename: "testbox-backup-2026-09-29.json" },
  ]);
});

test("native export goes through the system saver only", async () => {
  const calls = [];
  const mode = await saveBackup({
    json: '{"a":1}',
    filename: "testbox-backup-2026-09-29.json",
    isNative: () => true,
    nativeSaver: async ({ json, filename }) => {
      calls.push({ json, filename });
      return { uri: "content://documents/testbox-backup-2026-09-29.json" };
    },
    webDownloader: () => {
      throw new Error("blob download must not run natively");
    },
  });

  assert.equal(mode, "native");
  assert.deepEqual(calls, [
    { json: '{"a":1}', filename: "testbox-backup-2026-09-29.json" },
  ]);
});

test("native saver rejection propagates (cancel/failure never reports success)", async () => {
  const cancelled = Object.assign(new Error("cancelled"), { code: "cancelled" });
  await assert.rejects(
    saveBackup({
      json: "{}",
      filename: "testbox-backup-2026-09-29.json",
      isNative: () => true,
      nativeSaver: async () => {
        throw cancelled;
      },
      webDownloader: () => {
        throw new Error("blob download must not run natively");
      },
    }),
    (error) => error.code === "cancelled"
  );
});

test("native success resolves only after the write completes", async () => {
  let resolved = false;
  const promise = saveBackup({
    json: '{"a":1}',
    filename: "testbox-backup-2026-09-29.json",
    isNative: () => true,
    nativeSaver: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve({ uri: "content://documents/ok" });
        }, 10);
      }),
    webDownloader: () => {
      throw new Error("blob download must not run natively");
    },
  });

  assert.equal(resolved, false);
  const mode = await promise;
  assert.equal(mode, "native");
  assert.equal(resolved, true);
});
