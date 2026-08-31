<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { ResourceKind, Role } from "@stablemanager/shared";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/dates";
import type { Invite, Member, Resource, Tenant } from "@/types/api";

const { t } = useI18n();

const tenant = ref<Tenant | null>(null);
const members = ref<Member[]>([]);
const invites = ref<Invite[]>([]);
const resources = ref<Resource[]>([]);
const loading = ref(true);
const error = ref("");
const saving = ref(false);
const inviteDevLink = ref("");

const tenantForm = ref({ name: "", timezone: "Europe/Berlin", maxDailyServiceTasks: 3 });
const inviteForm = ref({
  email: "",
  role: "boarder" as Role,
  name: "",
});
const resourceForm = ref({
  name: "",
  kind: "oval_track" as ResourceKind,
});
const showResourceForm = ref(false);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [tRes, mRes, iRes, rRes] = await Promise.all([
      api<{ tenant: Tenant }>("/api/tenants/current"),
      api<{ members: Member[] }>("/api/tenants/members"),
      api<{ invites: Invite[] }>("/api/tenants/invites"),
      api<{ resources: Resource[] }>("/api/tenants/resources"),
    ]);
    tenant.value = tRes.tenant;
    tenantForm.value = {
      name: tRes.tenant.name,
      timezone: tRes.tenant.timezone,
      maxDailyServiceTasks: tRes.tenant.maxDailyServiceTasks,
    };
    members.value = mRes.members;
    invites.value = iRes.invites;
    resources.value = rRes.resources;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}

async function saveTenant() {
  saving.value = true;
  error.value = "";
  try {
    const res = await api<{ tenant: Tenant }>("/api/tenants/current", {
      method: "PATCH",
      body: JSON.stringify({
        name: tenantForm.value.name,
        timezone: tenantForm.value.timezone,
        maxDailyServiceTasks: tenantForm.value.maxDailyServiceTasks,
      }),
    });
    tenant.value = res.tenant;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function sendInvite() {
  saving.value = true;
  error.value = "";
  inviteDevLink.value = "";
  try {
    const res = await api<{ ok: boolean; devLink?: string }>(
      "/api/tenants/invites",
      {
        method: "POST",
        body: JSON.stringify({
          email: inviteForm.value.email,
          role: inviteForm.value.role,
          name: inviteForm.value.name.trim() || undefined,
        }),
      },
    );
    if (res.devLink) inviteDevLink.value = res.devLink;
    inviteForm.value = { email: "", role: "boarder", name: "" };
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function createResource() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/tenants/resources", {
      method: "POST",
      body: JSON.stringify(resourceForm.value),
    });
    resourceForm.value = { name: "", kind: "oval_track" };
    showResourceForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deleteResource(id: string) {
  if (!confirm(t("common.confirmDelete"))) return;
  try {
    await api(`/api/tenants/resources/${id}`, { method: "DELETE" });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold text-brand-800">{{ t("settings.title") }}</h1>
    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <section v-if="tenant" class="space-y-3">
      <h2 class="font-medium text-stone-800">{{ t("settings.tenant") }}</h2>
      <form
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="saveTenant"
      >
        <label class="block text-sm font-medium">
          {{ t("settings.tenantName") }}
          <input v-model="tenantForm.name" required class="field mt-1" />
        </label>
        <label class="block text-sm font-medium">
          {{ t("settings.timezone") }}
          <input v-model="tenantForm.timezone" required class="field mt-1" />
        </label>
        <label class="block text-sm font-medium">
          {{ t("settings.maxDailyServiceTasks") }}
          <input v-model.number="tenantForm.maxDailyServiceTasks" type="number" min="1" max="12" required class="field mt-1" />
        </label>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ saving ? t("common.loading") : t("common.save") }}
        </button>
      </form>
    </section>

    <section class="space-y-3">
      <h2 class="font-medium text-stone-800">{{ t("settings.members") }}</h2>
      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="m in members"
          :key="m.userId"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="font-medium">{{ m.name }}</p>
            <p class="text-xs text-stone-500">{{ m.email }}</p>
          </div>
          <span class="rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-800">
            {{ t(`roles.${m.role}`) }}
          </span>
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <h2 class="font-medium text-stone-800">{{ t("settings.invites") }}</h2>
      <form
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="sendInvite"
      >
        <label class="block text-sm font-medium">
          {{ t("settings.inviteEmail") }}
          <input
            v-model="inviteForm.email"
            type="email"
            required
            class="field mt-1"
          />
        </label>
        <label class="block text-sm font-medium">
          {{ t("settings.inviteRole") }}
          <select v-model="inviteForm.role" class="field mt-1">
            <option value="hof_admin">{{ t("roles.hof_admin") }}</option>
            <option value="staff">{{ t("roles.staff") }}</option>
            <option value="boarder">{{ t("roles.boarder") }}</option>
          </select>
        </label>
        <label class="block text-sm font-medium">
          {{ t("settings.inviteName") }}
          <input v-model="inviteForm.name" class="field mt-1" />
        </label>
        <button type="submit" class="btn-primary" :disabled="saving">
          {{ t("settings.sendInvite") }}
        </button>
        <a
          v-if="inviteDevLink"
          :href="inviteDevLink"
          class="mt-2 block break-all text-sm text-brand-700 underline"
        >
          {{ t("settings.inviteDevLink") }}
        </a>
      </form>

      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li v-for="inv in invites" :key="inv.id" class="px-4 py-3 text-sm">
          <p class="font-medium">
            {{ inv.email }} · {{ t(`roles.${inv.role}`) }}
          </p>
          <p class="text-xs text-stone-500">
            {{ t("settings.pending") }} · bis
            {{ formatDateTime(inv.expiresAt) }}
          </p>
        </li>
        <li v-if="!invites.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("common.empty") }}
        </li>
      </ul>
    </section>

    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="font-medium text-stone-800">{{ t("settings.resources") }}</h2>
        <button
          type="button"
          class="btn-primary"
          @click="showResourceForm = !showResourceForm"
        >
          {{ t("settings.addResource") }}
        </button>
      </div>

      <form
        v-if="showResourceForm"
        class="space-y-3 rounded-2xl border border-stone-200 bg-white p-4"
        @submit.prevent="createResource"
      >
        <label class="block text-sm font-medium">
          {{ t("settings.resourceName") }}
          <input v-model="resourceForm.name" required class="field mt-1" />
        </label>
        <label class="block text-sm font-medium">
          {{ t("settings.resourceKind") }}
          <select v-model="resourceForm.kind" class="field mt-1">
            <option value="oval_track">{{ t("resourceKind.oval_track") }}</option>
            <option value="indoor_arena">
              {{ t("resourceKind.indoor_arena") }}
            </option>
            <option value="other">{{ t("resourceKind.other") }}</option>
          </select>
        </label>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn-ghost flex-1"
            @click="showResourceForm = false"
          >
            {{ t("common.cancel") }}
          </button>
          <button type="submit" class="btn-primary flex-1" :disabled="saving">
            {{ t("common.create") }}
          </button>
        </div>
      </form>

      <ul
        class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white"
      >
        <li
          v-for="r in resources"
          :key="r.id"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p class="font-medium">{{ r.name }}</p>
            <p class="text-xs text-stone-500">
              {{ t(`resourceKind.${r.kind}`) }}
            </p>
          </div>
          <button
            type="button"
            class="text-sm text-red-600"
            @click="deleteResource(r.id)"
          >
            {{ t("common.delete") }}
          </button>
        </li>
        <li v-if="!resources.length" class="px-4 py-3 text-sm text-stone-500">
          {{ t("common.empty") }}
        </li>
      </ul>
    </section>
  </div>
</template>
