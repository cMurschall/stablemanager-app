<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

type PasswordPreview = {
  email: string;
  name: string;
  purpose: "welcome" | "reset";
};

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const loading = ref(true);
const error = ref("");
const preview = ref<PasswordPreview | null>(null);
const password = ref("");
const passwordConfirm = ref("");

const title = computed(() =>
  preview.value?.purpose === "reset" ? t("setPassword.titleReset") : t("setPassword.titleWelcome"),
);
const intro = computed(() => {
  if (!preview.value) return "";
  return preview.value.purpose === "reset"
    ? t("setPassword.introReset", { email: preview.value.email })
    : t("setPassword.introWelcome", { email: preview.value.email });
});

onMounted(async () => {
  try {
    preview.value = await api(`/api/auth/password/${route.params.token}`);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("common.error");
  } finally {
    loading.value = false;
  }
});

async function submit() {
  if (password.value !== passwordConfirm.value) {
    error.value = t("setPassword.passwordMismatch");
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        token: String(route.params.token),
        password: password.value,
      }),
    });
    await auth.fetchMe();
    await router.push({ name: "home" });
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
      <h1 class="text-xl font-semibold text-brand-800">{{ title }}</h1>
      <p v-if="loading && !preview" class="mt-4 text-sm text-stone-500">{{ t("common.loading") }}</p>
      <p v-else-if="error && !preview" class="mt-4 text-sm text-red-600">{{ error }}</p>
      <form v-else-if="preview" class="mt-4 space-y-4" @submit.prevent="submit">
        <p class="text-sm text-stone-600">{{ intro }}</p>
        <label class="block text-sm font-medium">
          {{ t("setPassword.password") }}
          <input v-model="password" type="password" required minlength="8" autocomplete="new-password" class="field" />
        </label>
        <label class="block text-sm font-medium">
          {{ t("setPassword.passwordConfirm") }}
          <input v-model="passwordConfirm" type="password" required minlength="8" autocomplete="new-password" class="field" />
        </label>
        <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
        <button type="submit" class="btn-primary w-full" :disabled="loading">
          {{ t("setPassword.submit") }}
        </button>
      </form>
    </div>
  </div>
</template>
