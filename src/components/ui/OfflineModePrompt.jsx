import Modal from "./Modal";
import Button from "./Button";
import { useOfflineMode } from "../../context/OfflineModeContext";
import { useTranslation } from "../../i18n";

/**
 * Connectivity prompt (spec §18): when the app has no internet and the
 * user has NOT selected offline mode, offer Retry or Enter Offline Mode.
 * Never auto-enters offline mode; dismissing keeps normal online logic.
 */
export default function OfflineModePrompt() {
  const { t } = useTranslation();
  const { showPrompt, dismissPrompt, retryConnectivity, enterOfflineMode } =
    useOfflineMode();

  return (
    <Modal
      open={showPrompt}
      onClose={dismissPrompt}
      title={t("offline.prompt.title")}
      subtitle={t("offline.prompt.subtitle")}
      size="sm"
    >
      <div className="offline-prompt-actions">
        <Button variant="secondary" onClick={retryConnectivity}>
          {t("offline.prompt.retry")}
        </Button>
        <Button variant="primary" onClick={enterOfflineMode}>
          {t("offline.prompt.enter")}
        </Button>
      </div>
    </Modal>
  );
}
