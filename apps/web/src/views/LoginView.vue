<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import type { Role } from "@stablemanager/shared";
import { useAuthStore } from "@/stores/auth";
import { api, ApiError } from "@/lib/api";

type DevUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
  tenantName: string;
};

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();

const users = ref<DevUser[]>([]);
const loading = ref(false);
const error = ref("");
const needsBootstrap = ref(false);

const roleLabel: Record<Role, string> = {
  hof_admin: "Hof-Admin",
  staff: "Mitarbeiter",
  boarder: "Einsteller",
};

async function loadUsers() {
  loading.value = true;
  error.value = "";
  try {
    const data = await api<{ users: DevUser[] }>("/api/auth/dev-users");
    users.value = data.users;
    needsBootstrap.value = data.users.length === 0;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("login.error");
    needsBootstrap.value = true;
  } finally {
    loading.value = false;
  }
}

async function ensureHof() {
  try {
    await api("/api/bootstrap", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) {
      const msg = e instanceof Error ? e.message : "";
      if (!/bereits|already|initialisiert/i.test(msg)) throw e;
    }
  }
}

async function loginAs(user: DevUser) {
  loading.value = true;
  error.value = "";
  try {
    await api("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email: user.email }),
    });
    await auth.fetchMe();
    await router.push({ name: "home" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("login.error");
  } finally {
    loading.value = false;
  }
}

/** First run: create demo hof + log in as admin — no password. */
async function startAsAdmin() {
  loading.value = true;
  error.value = "";
  try {
    await ensureHof();
    const data = await api<{ users: DevUser[] }>("/api/auth/dev-users");
    const admin = data.users.find((user) => user.role === "hof_admin");
    if (!admin) throw new Error("Kein Hof-Admin vorhanden");
    await api("/api/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ email: admin.email }),
    });
    await auth.fetchMe();
    await router.push({ name: "home" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("login.error");
    await loadUsers();
  } finally {
    loading.value = false;
  }
}

onMounted(loadUsers);
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div
      class="w-full max-w-md rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm backdrop-blur"
    >
      <p class="text-xs font-medium uppercase tracking-wide text-amber-700">
        Development · kein Passwort
      </p>
      <h1 class="mt-1 text-xl font-semibold text-brand-800">Login as</h1>
      <p class="mt-1 text-sm text-stone-500">
        Ein Klick = eingeloggt. Kein Passwort, kein Magic-Link, keine Mail.
      </p>

      <div v-if="needsBootstrap" class="mt-6">
        <button
          type="button"
          class="btn-primary w-full"
          :disabled="loading"
          @click="startAsAdmin"
        >
          {{ loading ? t("common.loading") : "Als Hof-Admin starten" }}
        </button>
      </div>

      <ul v-else class="mt-6 space-y-2">
        <li v-for="u in users" :key="u.id">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-3 rounded-xl border border-stone-200 px-4 py-3 text-left hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
            :disabled="loading"
            @click="loginAs(u)"
          >
            <span>
              <span class="block text-sm font-medium text-stone-900">{{
                u.name
              }}</span>
              <span class="block text-xs text-stone-500">{{ u.email }}</span>
            </span>
            <span
              class="shrink-0 rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700"
            >
              {{ roleLabel[u.role] ?? u.role }}
            </span>
          </button>
        </li>
      </ul>

      <button
        v-if="!needsBootstrap"
        type="button"
        class="btn-ghost mt-4"
        :disabled="loading"
        @click="loadUsers"
      >
        Liste aktualisieren
      </button>

      <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>
    </div>
  </div>
</template>
