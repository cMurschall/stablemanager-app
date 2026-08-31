<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const error = ref("");
const invite = ref<{
  email: string;
  role: string;
  name: string | null;
  tenantName: string;
} | null>(null);
const name = ref("");

onMounted(async () => {
  try {
    invite.value = await api(`/api/auth/invite/${route.params.token}`);
    name.value = invite.value?.name ?? "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
});

async function accept() {
  loading.value = true;
  error.value = "";
  try {
    await api("/api/auth/invite/accept", {
      method: "POST",
      body: JSON.stringify({
        token: String(route.params.token),
        name: name.value,
      }),
    });
    await auth.fetchMe();
    await router.push({ name: "horses" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center px-4">
    <div class="w-full max-w-md rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm">
      <h1 class="text-xl font-semibold text-brand-800">{{ t("invite.title") }}</h1>
      <p v-if="loading" class="mt-4 text-sm text-stone-500">{{ t("common.loading") }}</p>
      <p v-else-if="error" class="mt-4 text-sm text-red-600">{{ error }}</p>
      <form v-else-if="invite" class="mt-4 space-y-4" @submit.prevent="accept">
        <p class="text-sm text-stone-600">
          {{
            t("invite.intro", {
              tenant: invite.tenantName,
              role: t(`roles.${invite.role}`),
              email: invite.email,
            })
          }}
        </p>
        <label class="block text-sm font-medium">
          {{ t("invite.name") }}
          <input v-model="name" required class="field" />
        </label>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ t("invite.join") }}
        </button>
      </form>
    </div>
  </div>
</template>
