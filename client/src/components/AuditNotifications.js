import React from "react";
import { message } from "antd";
import { axiosInstance } from "../helpers/axiosInstance";

const canSeeAuditNotifications = (user) => {
  const role = String(user?.role || "").toUpperCase();
  return role === "SUPER_ADMIN" || role === "COMPANY_ADMIN";
};

const formatTime = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function AuditNotifications({ user }) {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const notificationRef = React.useRef(null);
  const audioContextRef = React.useRef(null);
  const hasLoadedNotificationsRef = React.useRef(false);
  const previousUnreadCountRef = React.useRef(0);

  const playNotificationSound = React.useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = audioContextRef.current || new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.14);
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log("[audit-notifications] sound blocked", error.message);
    }
  }, []);

  const unlockNotificationSound = React.useCallback(() => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioContext = audioContextRef.current || new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }
    } catch (error) {
      console.log("[audit-notifications] sound unlock failed", error.message);
    }
  }, []);

  const fetchNotifications = React.useCallback(async () => {
    if (!canSeeAuditNotifications(user)) return;
    try {
      const response = await axiosInstance.get("/api/notifications?limit=20");
      if (response.data.success) {
        const nextUnreadCount = Number(response.data.unreadCount || 0);
        setNotifications(response.data.data || []);
        setUnreadCount(nextUnreadCount);
        if (hasLoadedNotificationsRef.current && nextUnreadCount > previousUnreadCountRef.current) {
          playNotificationSound();
        }
        hasLoadedNotificationsRef.current = true;
        previousUnreadCountRef.current = nextUnreadCount;
      }
    } catch (error) {
      console.log("[audit-notifications] fetch failed", error.response?.data?.message || error.message);
    }
  }, [playNotificationSound, user]);

  const markRead = async () => {
    try {
      await axiosInstance.post("/api/notifications/mark-read", {});
      setUnreadCount(0);
      fetchNotifications();
    } catch (error) {
      message.error(error.response?.data?.message || error.message);
    }
  };

  React.useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  React.useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("touchstart", closeOnOutsideClick);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("touchstart", closeOnOutsideClick);
    };
  }, [open]);

  if (!canSeeAuditNotifications(user)) return null;

  return (
    <div className="audit-notifications" ref={notificationRef}>
      <button
        type="button"
        className="audit-notification-button"
        onClick={() => {
          unlockNotificationSound();
          setOpen((next) => !next);
        }}
        aria-label="Audit notifications"
      >
        <i className="ri-notification-3-line"></i>
        {unreadCount > 0 && <span>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="audit-notification-panel">
          <div className="audit-notification-panel-header">
            <div>
              <strong>Audit Notifications</strong>
              <p>{unreadCount} unread</p>
            </div>
            <button type="button" onClick={markRead}>Mark read</button>
          </div>

          <div className="audit-notification-list">
            {notifications.length ? (
              notifications.map((notification) => (
                <div className="audit-notification-item" key={notification._id}>
                  <div>
                    {notification.action === "status_reminder" && <span className="audit-reminder-label">Reminder</span>}
                    <strong>{notification.message}</strong>
                    <p>{notification.module || "system"} · {formatTime(notification.createdAt)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="audit-notification-empty">No audit notifications yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AuditNotifications;
