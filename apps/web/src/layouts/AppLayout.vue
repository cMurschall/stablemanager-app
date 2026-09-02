<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from "vue-router";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Role } from "@stablemanager/shared";
import { useAuthStore } from "@/stores/auth";
import { useNotificationsStore } from "@/stores/notifications";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import AppDialog from "@/components/AppDialog.vue";

type DevUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const { t } = useI18n();
const auth = useAuthStore();
const notifications = useNotificationsStore();
const router = useRouter();
const menuOpen = ref(false);
const inboxOpen = ref(false);
const devUsers = ref<DevUser[]>([]);
const switching = ref(false);

const roleOrder: Record<Role, number> = {
  hof_admin: 0,
  staff: 1,
  boarder: 2,
};

const sortedDevUsers = computed(() =>
  [...devUsers.value].sort(
    (a, b) =>
      roleOrder[a.role] - roleOrder[b.role] ||
      a.name.localeCompare(b.name, "de"),
  ),
);

onMounted(async () => {
  await notifications.fetchUnreadCount();
  try {
    const data = await api<{ users: DevUser[]; environment: string }>(
      "/api/auth/dev-users",
    );
    if (data.environment !== "production") {
      devUsers.value = data.users;
    }
  } catch {
    /* production or unavailable */
  }
});

async function onLogout() {
  await auth.logout();
  router.push({ name: "login" });
}

async function onSwitch(tenantId: string) {
  await auth.switchTenant(tenantId);
  menuOpen.value = false;
  router.go(0);
}

async function loginAs(email: string) {
  if (!email || email === auth.user?.email) return;
  switching.value = true;
  try {
    await api("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    await auth.fetchMe();
    router.go(0);
  } finally {
    switching.value = false;
  }
}

async function openInbox() {
  inboxOpen.value = true;
  await notifications.fetchList();
}

async function onMarkRead(id: string) {
  try {
    await notifications.markRead(id);
  } catch {
    /* ignore */
  }
}

async function onMarkAllRead() {
  try {
    await notifications.markAllRead();
  } catch {
    /* ignore */
  }
}

const links = [
  { to: "/home", label: "nav.home" },
  { to: "/hof", label: "nav.hof", adminOnly: true },
  { to: "/horses", label: "nav.horses", hideForAdmin: true },
  { to: "/housing", label: "nav.housing", hideForAdmin: true },
  { to: "/calendar", label: "nav.calendar" },
  { to: "/training", label: "nav.training" },
  { to: "/farrier", label: "nav.farrier" },
  { to: "/services", label: "nav.services" },
  { to: "/board", label: "nav.board" },
  { to: "/reminders", label: "nav.reminders" },
];

const visibleLinks = computed(() =>
  links.filter((link) => {
    if (link.adminOnly && !auth.isAdmin) return false;
    if (link.hideForAdmin && auth.isAdmin) return false;
    return true;
  }),
);
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-lg p-2 text-stone-600 hover:bg-stone-100 md:hidden"
            aria-label="Menü"
            @click="menuOpen = !menuOpen"
          >
            ☰
          </button>
          <div>
            <p class="text-sm font-semibold text-brand-700">{{ t("appName") }}</p>
            <p class="text-xs text-stone-500">
              {{ auth.currentTenant?.tenantName ?? "—" }}
              <span v-if="auth.currentRole" class="text-stone-400">
                · {{ t(`roles.${auth.currentRole}`) }}
              </span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <select
            v-if="devUsers.length > 0"
            class="max-w-[11rem] truncate rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-sm text-amber-900"
            :value="auth.user?.email ?? ''"
            :disabled="switching"
            title="Login as (nur Development)"
            @change="loginAs(($event.target as HTMLSelectElement).value)"
          >
            <option disabled value="">Login as…</option>
            <option v-for="u in sortedDevUsers" :key="u.id" :value="u.email">
              {{ u.name }} ({{ t(`roles.${u.role}`) }})
            </option>
          </select>
          <select
            v-if="auth.memberships.length > 1"
            class="hidden max-w-[10rem] truncate rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm sm:block"
            :value="auth.currentTenantId ?? undefined"
            @change="onSwitch(($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="m in auth.memberships"
              :key="m.tenantId"
              :value="m.tenantId"
            >
              {{ m.tenantName }}
            </option>
          </select>
          <button
            type="button"
            class="relative rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
            :aria-label="
              notifications.unreadCount
                ? `${notifications.unreadCount} ungelesene Benachrichtigungen`
                : t('nav.notifications')
            "
            @click="openInbox"
          >
            🔔
            <span
              v-if="notifications.unreadCount > 0"
              class="absolute -right-1 -top-1 rounded-full bg-brand-600 px-1.5 text-[10px] text-white"
            >
              {{ notifications.unreadCount }}
            </span>
          </button>
          <button
            type="button"
            class="btn-ghost"
            @click="onLogout"
          >
            {{ t("nav.logout") }}
          </button>
        </div>
      </div>

      <nav class="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:flex">
        <RouterLink
          v-for="link in visibleLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-brand-50 hover:text-brand-700"
          active-class="!bg-brand-100 !text-brand-800 font-medium"
        >
          {{ t(link.label) }}
        </RouterLink>
        <RouterLink
          v-if="auth.isAdmin"
          to="/settings"
          class="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-brand-50 hover:text-brand-700"
          active-class="!bg-brand-100 !text-brand-800 font-medium"
        >
          {{ t("nav.settings") }}
        </RouterLink>
      </nav>

      <nav
        v-if="menuOpen"
        class="flex flex-col gap-1 border-t border-stone-100 px-4 py-2 md:hidden"
      >
        <RouterLink
          v-for="link in visibleLinks"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-brand-50"
          active-class="!bg-brand-100 !text-brand-800 font-medium"
          @click="menuOpen = false"
        >
          {{ t(link.label) }}
        </RouterLink>
        <label v-if="auth.memberships.length > 1" class="px-3 py-2 text-sm text-stone-600">
          Hof wechseln
          <select class="field mt-1" :value="auth.currentTenantId ?? undefined" @change="onSwitch(($event.target as HTMLSelectElement).value)">
            <option v-for="m in auth.memberships" :key="m.tenantId" :value="m.tenantId">{{ m.tenantName }}</option>
          </select>
        </label>
        <RouterLink
          v-if="auth.isAdmin"
          to="/settings"
          class="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-brand-50"
          @click="menuOpen = false"
        >
          {{ t("nav.settings") }}
        </RouterLink>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <RouterView />
    </main>

    <AppDialog
      :open="inboxOpen"
      :title="t('notifications.title')"
      @close="inboxOpen = false"
    >
      <div class="flex items-center justify-between gap-2">
        <p class="text-sm text-stone-500">
          {{
            notifications.unreadCount
              ? `${notifications.unreadCount} ungelesen`
              : t("notifications.empty")
          }}
        </p>
        <button
          v-if="notifications.items.some((n) => !n.readAt)"
          type="button"
          class="btn-ghost"
          @click="onMarkAllRead"
        >
          {{ t("common.markAllRead") }}
        </button>
      </div>
      <p v-if="notifications.loading" class="mt-4 text-sm text-stone-500">
        {{ t("common.loading") }}
      </p>
      <ul
        v-else
        class="mt-4 divide-y divide-stone-200 rounded-2xl border border-stone-200"
      >
        <li
          v-for="n in notifications.items"
          :key="n.id"
          class="flex items-start justify-between gap-3 px-4 py-3"
          :class="!n.readAt ? 'bg-brand-50/50' : ''"
        >
          <div>
            <p class="font-medium">
              <span v-if="!n.readAt" class="mr-1 text-xs text-brand-700">
                {{ t("common.unread") }}
              </span>
              {{ n.title }}
            </p>
            <p v-if="n.body" class="text-sm text-stone-600">{{ n.body }}</p>
            <p class="text-xs text-stone-500">{{ formatDateTime(n.createdAt) }}</p>
          </div>
          <button
            v-if="!n.readAt"
            type="button"
            class="btn-ghost shrink-0"
            @click="onMarkRead(n.id)"
          >
            {{ t("common.markRead") }}
          </button>
        </li>
        <li
          v-if="!notifications.items.length"
          class="px-4 py-3 text-sm text-stone-500"
        >
          {{ t("notifications.empty") }}
        </li>
      </ul>
    </AppDialog>
  </div>
</template>
