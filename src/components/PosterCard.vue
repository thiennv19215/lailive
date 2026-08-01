<script setup lang="ts">
defineProps<{
  title: string;
  image: string;
  tone?: 'orange' | 'pink' | 'blue';
  label?: string;
  showOverlay?: boolean;
  campaign?: string;
  variant?: 'gold' | 'studio' | 'blossom' | 'mega' | 'food' | 'rose' | 'beige' | 'neutral' | 'mint' | 'sky';
}>();
</script>

<template>
  <article class="poster-card" :class="[`tone-${tone ?? 'orange'}`, variant ? `campaign-${variant}` : '']">
    <div class="poster-visual">
      <img :src="image" :alt="title" />
      <div v-if="campaign" class="campaign-art" aria-hidden="true">
        <small>LIVE DEAL</small>
        <strong>{{ campaign }}</strong>
        <span>Ưu đãi giới hạn</span>
      </div>
      <div v-if="showOverlay !== false" class="poster-wash" />
      <div v-if="showOverlay !== false" class="poster-copy"><small>LIVE SALE</small><strong>{{ title }}</strong><span>Ưu đãi trong phiên live</span></div>
    </div>
    <footer><strong>{{ title }}</strong><span v-if="label">{{ label }}</span></footer>
  </article>
</template>
