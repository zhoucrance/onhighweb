import Dexie from "dexie";

export const offlineDb = new Dexie("onhighbus_offline");

offlineDb.version(1).stores({
  snapshots: "key, updatedAt",
  pendingActions: "++id, type, createdAt, status",
});

export const saveOfflineSnapshot = async (key, data) => {
  await offlineDb.snapshots.put({
    key,
    data,
    updatedAt: new Date().toISOString(),
  });
};

export const getOfflineSnapshot = async (key) => {
  const snapshot = await offlineDb.snapshots.get(key);
  return snapshot?.data || null;
};

export const queuePendingAction = async (type, payload) => {
  return offlineDb.pendingActions.add({
    type,
    payload,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
};
