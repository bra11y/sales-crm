export type NotificationKind = "mention" | "stage" | "alert" | "update" | "invite";

export type Notification = {
  id: string;
  kind: NotificationKind;
  actor?: string;
  companyId: string;
  message: string;
  quote?: string;
  time: string;
  at: string;
  unread: boolean;
};

const SEEN_KEY = "crm-notifications-seen";

export function lastSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function markSeen(at: string) {
  try {
    localStorage.setItem(SEEN_KEY, at);
  } catch {
    // Private windows can block storage; unread dots then reset on reload.
  }
}
