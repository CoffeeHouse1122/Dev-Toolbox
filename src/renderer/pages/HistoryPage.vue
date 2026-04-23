<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { ConversionRecord } from "../../shared/types";

const records = ref<ConversionRecord[]>([]);

async function refresh() {
  records.value = await window.devToolbox.listHistory(120);
}

async function clearHistory() {
  await window.devToolbox.clearHistory();
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>History</h2>
        <p>SQLite local records</p>
      </div>
      <button type="button" class="secondary-button" @click="clearHistory">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
        Clear
      </button>
    </div>

    <section class="history-table">
      <div class="history-row table-head">
        <span>Tool</span>
        <span>Status</span>
        <span>Source</span>
        <span>Output</span>
        <span>Finished</span>
      </div>
      <button
        v-for="record in records"
        :key="record.id"
        type="button"
        class="history-row"
        @click="window.devToolbox.revealPath(record.outputPath)"
      >
        <span>{{ record.toolType }}</span>
        <span class="status-pill" :class="record.status">{{ record.status }}</span>
        <span>{{ record.sourcePath }}</span>
        <span>{{ record.outputPath }}</span>
        <span>{{ record.finishedAt || record.createdAt }}</span>
      </button>
      <div v-if="records.length === 0" class="empty-state">No records</div>
    </section>
  </section>
</template>
