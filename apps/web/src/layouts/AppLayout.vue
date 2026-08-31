<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from "vue-router";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Role } from "@stablemanager/shared";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/lib/api";

type DevUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const unread = ref(0);
const menuOpen = ref(false);
const devUsers = ref<DevUser[]>([]);
const switching = ref(false);

onMounted(async () => {
  try {
    const data = await api<{ unreadCount: number }>("/api/notifications?limit=1");
    unread.value = data.unreadCount;
  } catch {
    /* ignore */
  }
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

const links = [
  { to: "/horses", label: "nav.horses" },
  { to: "/housing", label: "nav.housing" },
  { to: "/calendar", label: "nav.calendar" },
  { to: "/board", label: "nav.board" },
  { to: "/farrier", label: "nav.farrier" },
  { to: "/services", label: "nav.services" },
  { to: "/reminders", label: "nav.reminders" },
];
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
                · {{ auth.currentRole }}
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
            <option v-for="u in devUsers" :key="u.id" :value="u.email">
              {{ u.name }} ({{ u.role }})
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
          <RouterLink
            to="/reminders"
            class="relative rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
          >
            🔔
            <span
              v-if="unread > 0"
              class="absolute -right-1 -top-1 rounded-full bg-brand-600 px-1.5 text-[10px] text-white"
            >
              {{ unread }}
            </span>
          </RouterLink>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-100"
            @click="onLogout"
          >
            {{ t("nav.logout") }}
          </button>
        </div>
      </div>

      <nav class="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 pb-2 md:flex">
        <RouterLink
          v-for="link in links"
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
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-brand-50"
          @click="menuOpen = false"
        >
          {{ t(link.label) }}
        </RouterLink>
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
  </div>
</template>
