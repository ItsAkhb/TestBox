import { isNativePlatform, saveJsonToSystemPicker } from "./native.js";

export function backupFilename(now = new Date()) {
  return `testbox-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadJsonWeb(json, filename) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function saveBackup({
  json,
  filename,
  isNative = isNativePlatform,
  nativeSaver = saveJsonToSystemPicker,
  webDownloader = downloadJsonWeb,
}) {
  if (isNative()) {
    await nativeSaver({ json, filename });
    return "native";
  }
  webDownloader(json, filename);
  return "web";
}
