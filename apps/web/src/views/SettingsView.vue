<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ApiError, api } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import type { Resource, Tenant, TrainingType } from "@/types/api";

const { t } = useI18n();

const tenant = ref<Tenant | null>(null);
const resources = ref<Resource[]>([]);
const trainingTypes = ref<TrainingType[]>([]);
const loading = ref(true);
const error = ref("");
const saving = ref(false);
const success = ref("");
const deleteTarget = ref<{ kind: "resource" | "trainingType"; id: string } | null>(null);
const restorePayload = ref<unknown>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const tenantForm = ref({ name: "", timezone: "Europe/Berlin", maxDailyServiceTasks: 3 });
const resourceForm = ref({ name: "" });
const showResourceForm = ref(false);
const trainingTypeName = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [tRes, rRes, trainingRes] = await Promise.all([
      api<{ tenant: Tenant }>("/api/tenants/current"),
      api<{ resources: Resource[] }>("/api/tenants/resources"),
      api<{ trainingTypes: TrainingType[] }>("/api/tenants/training-types"),
    ]);
    tenant.value = tRes.tenant;
    tenantForm.value = {
      name: tRes.tenant.name,
      timezone: tRes.tenant.timezone,
      maxDailyServiceTasks: tRes.tenant.maxDailyServiceTasks,
    };
    resources.value = rRes.resources;
    trainingTypes.value = trainingRes.trainingTypes;
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

async function createResource() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/tenants/resources", {
      method: "POST",
      body: JSON.stringify(resourceForm.value),
    });
    resourceForm.value = { name: "" };
    showResourceForm.value = false;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deleteResource(id: string) {
  deleteTarget.value = { kind: "resource", id };
}

async function createTrainingType() {
  saving.value = true;
  error.value = "";
  try {
    await api("/api/tenants/training-types", {
      method: "POST",
      body: JSON.stringify({ name: trainingTypeName.value }),
    });
    trainingTypeName.value = "";
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function deleteTrainingType(id: string) {
  deleteTarget.value = { kind: "trainingType", id };
}

async function confirmDelete() {
  if (!deleteTarget.value) return;
  const target = deleteTarget.value;
  deleteTarget.value = null;
  try {
    if (target.kind === "resource") {
      await api(`/api/tenants/resources/${target.id}`, { method: "DELETE" });
    } else {
      await api(`/api/tenants/training-types/${target.id}`, { method: "DELETE" });
    }
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  }
}

function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="([^"]+)"/i.exec(header);
  return match?.[1] ?? null;
}

async function downloadBackup() {
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const res = await fetch("/api/tenants/backup", { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data);
    }
    const blob = await res.blob();
    const filename =
      filenameFromDisposition(res.headers.get("Content-Disposition")) ||
      `hof-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

async function onBackupFile(event: Event) {
  error.value = "";
  success.value = "";
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const text = await file.text();
    restorePayload.value = JSON.parse(text) as unknown;
  } catch {
    error.value = t("common.error");
    restorePayload.value = null;
  }
}

async function confirmRestore() {
  if (!restorePayload.value) return;
  const payload = restorePayload.value;
  restorePayload.value = null;
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    await api("/api/tenants/restore", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    success.value = t("settings.backupRestoreOk");
    await load();
    window.location.reload();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold text-brand-800">{{ t("settings.title") }}</h1>
    <p v-if="loading" class="text-sm text-stone-500">{{ t("common.loading") }}</p>
    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    <p v-if="success" class="text-sm text-emerald-700">{{ success }}</p>

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

    <section class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("settings.backup") }}</h2>
      <p class="text-sm text-stone-500">{{ t("settings.backupHint") }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn-primary"
          :disabled="saving"
          @click="downloadBackup"
        >
          {{ t("settings.backupDownload") }}
        </button>
        <button
          type="button"
          class="btn-danger"
          :disabled="saving"
          @click="fileInput?.click()"
        >
          {{ t("settings.backupRestore") }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onBackupFile"
        />
      </div>
      <p class="text-xs text-stone-500">{{ t("settings.backupPickFile") }}</p>
    </section>

    <section class="groupbox">
      <h2 class="font-medium text-stone-800">{{ t("settings.trainingTypes") }}</h2>
      <form class="flex gap-2" @submit.prevent="createTrainingType">
        <input v-model="trainingTypeName" required class="field flex-1" :placeholder="t('settings.trainingTypeName')" />
        <button type="submit" class="btn-primary" :disabled="saving">{{ t("common.create") }}</button>
      </form>
      <ul class="divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
        <li v-for="trainingType in trainingTypes" :key="trainingType.id" class="flex items-center justify-between gap-3 px-4 py-3">
          <span class="font-medium">{{ trainingType.name }}</span>
          <button type="button" class="btn-danger" @click="deleteTrainingType(trainingType.id)">{{ t("common.delete") }}</button>
        </li>
        <li v-if="!trainingTypes.length" class="px-4 py-3 text-sm text-stone-500">{{ t("common.empty") }}</li>
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
          </div>
          <button
            type="button"
            class="btn-danger"
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

    <ConfirmDialog
      :open="deleteTarget != null"
      :title="t('common.delete')"
      :message="t('common.confirmDelete')"
      :confirm-label="t('common.delete')"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
    <ConfirmDialog
      :open="restorePayload != null"
      :title="t('settings.backupRestore')"
      :message="t('settings.backupRestoreConfirm')"
      :confirm-label="t('settings.backupRestore')"
      @close="restorePayload = null"
      @confirm="confirmRestore"
    />
  </div>
</template>
