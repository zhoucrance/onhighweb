import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

function OfflineStatusSync() {
  const setOfflineStatus = useAppStore((state) => state.setOfflineStatus);

  useEffect(() => {
    const syncStatus = () => setOfflineStatus(!navigator.onLine);
    syncStatus();
    window.addEventListener("online", syncStatus);
    window.addEventListener("offline", syncStatus);
    return () => {
      window.removeEventListener("online", syncStatus);
      window.removeEventListener("offline", syncStatus);
    };
  }, [setOfflineStatus]);

  return null;
}

export default OfflineStatusSync;
