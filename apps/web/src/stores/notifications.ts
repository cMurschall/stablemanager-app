import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/lib/api";
import type { Notification } from "@/types/api";

export const useNotificationsStore = defineStore("notifications", () => {
  const unreadCount = ref(0);
  const items = ref<Notification[]>([]);
  const loading = ref(false);

  async function fetchUnreadCount() {
    try {
      const data = await api<{ unreadCount: number }>(
        "/api/notifications?limit=1",
      );
      unreadCount.value = data.unreadCount;
    } catch {
      /* ignore */
    }
  }

  async function fetchList() {
    loading.value = true;
    try {
      const data = await api<{
        notifications: Notification[];
        unreadCount: number;
      }>("/api/notifications");
      items.value = data.notifications;
      unreadCount.value = data.unreadCount;
    } finally {
      loading.value = false;
    }
  }

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: "POST" });
    const row = items.value.find((n) => n.id === id);
    if (row && !row.readAt) {
      row.readAt = new Date().toISOString();
      unreadCount.value = Math.max(0, unreadCount.value - 1);
    }
  }

  async function markAllRead() {
    await api("/api/notifications/read-all", { method: "POST" });
    const now = new Date().toISOString();
    for (const n of items.value) {
      if (!n.readAt) n.readAt = now;
    }
    unreadCount.value = 0;
  }

  return {
    unreadCount,
    items,
    loading,
    fetchUnreadCount,
    fetchList,
    markRead,
    markAllRead,
  };
});
