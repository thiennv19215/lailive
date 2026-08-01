<script setup lang="ts">
import { Check, X } from '@lucide/vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import beautyCream from '../assets/mock/beauty-cream.jpg';
import templateBeauty from '../assets/mock/template-beauty-v2.jpg';
import templateCosmetics from '../assets/mock/template-cosmetics-v2.jpg';
import templateHost from '../assets/mock/template-host-v2.jpg';
import templateMale from '../assets/mock/template-male-v2.jpg';
import AppShell from '../components/AppShell.vue';
import PosterCard from '../components/PosterCard.vue';

type TemplateVariant = 'gold' | 'studio' | 'blossom' | 'mega' | 'food' | 'rose' | 'beige' | 'neutral' | 'mint' | 'sky';
type Template = { title: string; image: string; tone: 'orange' | 'pink' | 'blue'; campaign: string; variant: TemplateVariant; badge?: string };

const router = useRouter();
const selectedTemplate = ref<Template | null>(null);
const notice = ref('');
const templates: Template[] = [
  { title: 'Perfume', image: templateHost, tone: 'orange', campaign: 'DEAL HỜI TRÊN LIVE', variant: 'gold', badge: 'HOT' },
  { title: 'Beauty 5', image: templateHost, tone: 'pink', campaign: 'COMBO 199K', variant: 'studio' },
  { title: 'Beauty 4', image: templateHost, tone: 'pink', campaign: 'SĂN DEAL THẢ GA', variant: 'blossom' },
  { title: 'Haircare', image: templateMale, tone: 'blue', campaign: 'MEGA SALE 12.12', variant: 'mega' },
  { title: 'Food', image: templateHost, tone: 'orange', campaign: 'GIỜ VÀNG SĂN DEAL', variant: 'food' },
  { title: 'Beauty sale day', image: templateHost, tone: 'pink', campaign: 'BEAUTY SALE DAY', variant: 'rose' },
  { title: 'Sale cực sốc', image: beautyCream, tone: 'orange', campaign: 'SALE CỰC SỐC', variant: 'beige' },
  { title: 'Săn sale liền tay', image: templateCosmetics, tone: 'blue', campaign: 'SĂN SALE LIỀN TAY', variant: 'neutral' },
  { title: 'Sale sập sàn', image: templateBeauty, tone: 'blue', campaign: 'SALE SẬP SÀN', variant: 'mint' },
  { title: 'Voucher thả ga', image: templateHost, tone: 'blue', campaign: 'VOUCHER THẢ GA', variant: 'sky' },
];

function applyTemplate(): void {
  if (!selectedTemplate.value) return;
  const title = selectedTemplate.value.title;
  selectedTemplate.value = null;
  notice.value = `Đã chọn “${title}”. Tạo dự án để tiếp tục.`;
}
</script>

<template>
  <AppShell>
    <section class="page-content template-page">
      <h1>Trung tâm mẫu</h1>
      <p>Chọn mẫu thiết kế để bắt đầu nhanh – đã có hơn 320 mẫu cho ngành hàng phổ biến.</p>
      <div v-if="notice" class="inline-notice project-notice"><Check :size="15" />{{ notice }}<button type="button" aria-label="Đóng thông báo" @click="notice = ''"><X :size="14" /></button></div>
      <div class="template-grid">
        <button v-for="template in templates" :key="template.title" class="template-button" type="button" @click="selectedTemplate = template">
          <PosterCard :title="template.title" :image="template.image" :tone="template.tone" :label="template.badge" :campaign="template.campaign" :variant="template.variant" :show-overlay="false" />
        </button>
      </div>
    </section>

    <div v-if="selectedTemplate" class="page-dialog-backdrop" @click.self="selectedTemplate = null">
      <section class="page-dialog template-dialog" role="dialog" aria-modal="true" aria-labelledby="template-dialog-title">
        <header><div><small>Trung tâm mẫu</small><h2 id="template-dialog-title">Sử dụng mẫu “{{ selectedTemplate.title }}”?</h2><p>Mẫu sẽ được dùng làm điểm bắt đầu cho một dự án local mới.</p></div><button type="button" aria-label="Đóng" @click="selectedTemplate = null"><X /></button></header>
        <div class="template-dialog-preview"><PosterCard :title="selectedTemplate.title" :image="selectedTemplate.image" :tone="selectedTemplate.tone" :label="selectedTemplate.badge" :campaign="selectedTemplate.campaign" :variant="selectedTemplate.variant" :show-overlay="false" /><div><strong>Khung hình dọc</strong><span>1080 × 1920 · 9:16</span><small>Ảnh mock độc lập, không sao chép asset tham chiếu.</small></div></div>
        <footer><button type="button" @click="selectedTemplate = null">Hủy</button><button type="button" @click="router.push('/')">Tạo dự án trống</button><button class="dialog-primary" type="button" @click="applyTemplate">Sử dụng mẫu</button></footer>
      </section>
    </div>
  </AppShell>
</template>
