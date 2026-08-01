<script setup lang="ts">
import { Image, Plus, Sticker, Type, Video } from '@lucide/vue';
import { ref } from 'vue';
import beautyCream from '../../assets/mock/beauty-cream.jpg';
import beautyStudio from '../../assets/mock/beauty-studio.jpg';
import templateHost from '../../assets/mock/template-host-v2.jpg';
import type { StudioToolName } from './studio-types';

defineProps<{ activeTool: StudioToolName }>();

const emit = defineEmits<{
  addLayer: [label: string];
  addLocalAudio: [];
  addLocalImage: [];
  addLocalVideo: [];
  openAvatarLibrary: [];
}>();

const backgroundSection = ref<'For You' | 'Của tôi'>('For You');
const videoCategory = ref<'Tất cả' | 'Default'>('Tất cả');
const stickerCategory = ref('After Sales Service');
const stickerSection = ref<'Hình dán' | 'Của tôi'>('Của tôi');
const stickerCategories = ['After Sales Service', 'Decorative', 'Product', 'Promotion', 'Sticker'];
const videoCategories: Array<'Tất cả' | 'Default'> = ['Tất cả', 'Default'];
</script>

<template>
  <section class="asset-browser">
    <button v-if="activeTool === 'Hình nền'" class="wide-primary compact" type="button" @click="emit('addLocalImage')"><Plus :size="17" />Thêm ảnh từ máy</button>
    <template v-if="activeTool === 'Avatar'">
      <button class="wide-primary" type="button" @click="emit('openAvatarLibrary')"><Plus :size="17" />Thêm avatar</button>
      <button class="asset-card" type="button" @click="emit('addLayer', 'Avatar - Chinese Beauty Sale 3')"><img :src="templateHost" alt="Avatar presenter" /><span><strong>Chinese Beauty Sale 3</strong></span></button>
    </template>
    <template v-else-if="activeTool === 'Hình nền'">
      <div class="panel-tabs"><button type="button" :class="{ active: backgroundSection === 'For You' }" @click="backgroundSection = 'For You'">Hình nền</button><button type="button" :class="{ active: backgroundSection === 'Của tôi' }" @click="backgroundSection = 'Của tôi'">Của tôi</button></div>
      <template v-if="backgroundSection === 'For You'">
        <div class="subtabs"><button type="button" class="active" aria-pressed="true" @click="backgroundSection = 'For You'">For You</button></div>
        <div class="asset-grid"><button type="button" @click="emit('addLayer', 'Background - Product table')"><img :src="beautyStudio" alt="Studio background" /><span>Beauty studio</span></button><button type="button" @click="emit('addLayer', 'Hình nền')"><img :src="beautyCream" alt="Product background" /><span>Product table</span></button></div>
      </template>
      <div v-else class="asset-empty"><Image :size="31" /><strong>Chưa có hình nền nào</strong><button type="button" @click="emit('addLayer', 'Hình nền')"><Plus :size="16" />Thêm hình nền</button></div>
    </template>
    <template v-else-if="activeTool === 'Video'">
      <div class="subtabs"><button v-for="category in videoCategories" :key="category" type="button" :class="{ active: videoCategory === category }" @click="videoCategory = category">{{ category }}</button></div>
      <button class="wide-primary compact" type="button" @click="emit('addLocalVideo')"><Plus :size="17" />Thêm video từ máy</button>
      <button class="wide-primary compact" type="button" @click="emit('addLocalAudio')"><Plus :size="17" />Thêm audio từ máy</button>
      <div class="video-assets"><button type="button" aria-label="Flower GIF" @click="emit('addLayer', 'Flower GIF')"><span class="video-thumb"><Video :size="24" /></span><strong>Flower GIF</strong></button><button type="button" @click="emit('addLayer', 'Video - airpods')"><span class="video-thumb"><Video :size="24" /></span><strong>airpods</strong></button><button type="button" @click="emit('addLayer', 'Video - water-glass')"><span class="video-thumb blue"><Video :size="24" /></span><strong>water-glass</strong></button></div>
    </template>
    <template v-else-if="activeTool === 'Hình dán'">
      <div class="panel-tabs"><button type="button" :class="{ active: stickerSection === 'Hình dán' }" :aria-pressed="stickerSection === 'Hình dán'" @click="stickerSection = 'Hình dán'">Hình dán</button><button type="button" :class="{ active: stickerSection === 'Của tôi' }" :aria-pressed="stickerSection === 'Của tôi'" @click="stickerSection = 'Của tôi'">Của tôi</button></div>
      <template v-if="stickerSection === 'Hình dán'"><div class="category-scroll"><button v-for="category in stickerCategories" :key="category" type="button" :class="{ active: stickerCategory === category }" @click="stickerCategory = category">{{ category }}</button></div><div class="sticker-grid"><button v-for="sticker in ['FREESHIP', '-50%', 'LIVE ONLY', 'HOT DEAL']" :key="sticker" type="button" @click="emit('addLayer', sticker)">{{ sticker }}</button></div></template>
      <div v-else class="asset-empty"><Sticker :size="31" /><strong>Chưa có hình dán cá nhân</strong><button type="button" @click="emit('addLayer', 'Hình dán của tôi')"><Plus :size="16" />Thêm hình dán</button></div>
    </template>
    <template v-else>
      <div class="asset-empty text-empty"><Type :size="34" /><strong>Thêm lớp văn bản vào canvas</strong><button type="button" @click="emit('addLayer', 'Văn bản')"><Plus :size="16" />Thêm văn bản</button></div>
    </template>
  </section>
</template>
