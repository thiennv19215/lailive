<script setup lang="ts">
/* global HTMLTextAreaElement */
import { AlignCenter, AlignLeft, AlignRight, Bold, CircleStop, Italic } from '@lucide/vue';
import { nextTick, ref, watch } from 'vue';
import { TEXT_FONT_FAMILIES, TEXT_STYLE_PRESETS, type StudioTextStyle, type TextAlignment, type TextStylePreset } from '../../shared/studio/text-style';
import type { ProjectSceneLayer } from '../../shared/contracts/projects';

const props = defineProps<{
  activeLayerKind?: ProjectSceneLayer['kind'];
  activeAvatarState?: ProjectSceneLayer['avatarState'];
  avatarPreviewState?: 'idle' | 'talking';
  textHistoryPastCount: number;
  textHistoryFutureCount: number;
  imageHistoryPastCount: number;
  imageHistoryFutureCount: number;
  avatarHistoryPastCount: number;
  avatarHistoryFutureCount: number;
  focusTextRequest: number;
}>();

const textStyle = defineModel<StudioTextStyle>('textStyle', { required: true });
const activeTextPresetId = defineModel<string | null>('activeTextPresetId', { required: true });
const imageRadius = defineModel<number>('imageRadius', { required: true });
const removeImageBackground = defineModel<boolean>('removeImageBackground', { required: true });
const backgroundColor = defineModel<string>('backgroundColor', { required: true });
const backgroundSensitivity = defineModel<number>('backgroundSensitivity', { required: true });
const textContentElement = ref<HTMLTextAreaElement | null>(null);

const emit = defineEmits<{
  applyTextPreset: [preset: TextStylePreset];
  captureImageEdit: [];
  captureTextEdit: [];
  commitImageEdit: [];
  editAvatar: [];
  setAvatarLayerState: [state: 'idle' | 'talking'];
  setAvatarPreviewState: [state: 'idle' | 'talking'];
  finishTextEdit: [];
  markTextCustom: [];
  openSettings: [];
  redoInspector: [];
  redoText: [];
  setTextAlignment: [alignment: TextAlignment];
  undoInspector: [];
  undoText: [];
}>();

const textAlignments = [
  { value: 'left' as const, label: 'Căn trái', icon: AlignLeft },
  { value: 'center' as const, label: 'Căn giữa', icon: AlignCenter },
  { value: 'right' as const, label: 'Căn phải', icon: AlignRight },
];

watch(() => props.focusTextRequest, async () => {
  await nextTick();
  textContentElement.value?.focus();
  textContentElement.value?.select();
});
</script>

<template>
  <aside class="live-sidebar">
    <section v-if="activeLayerKind === 'text'" class="source-properties-panel">
      <header><strong>Chỉnh sửa văn bản</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!textHistoryPastCount" @click="emit('undoText')">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!textHistoryFutureCount" @click="emit('redoText')">↷</button></div></header>
      <div class="source-properties-scroll">
        <label>Nội dung<textarea ref="textContentElement" v-model="textStyle.content" maxlength="160" aria-label="Nội dung văn bản" @focus="emit('captureTextEdit')" @input="emit('markTextCustom')" @blur="emit('finishTextEdit')" /></label>
        <label>Nét chữ<select v-model="textStyle.font" @change="emit('markTextCustom')"><option v-for="font in TEXT_FONT_FAMILIES" :key="font" :value="font">{{ font }}</option></select></label>
        <label>Cỡ chữ <b>{{ textStyle.size }}</b><input v-model.number="textStyle.size" type="range" min="12" max="96" aria-label="Cỡ chữ" @input="emit('markTextCustom')" /></label>
        <label>Màu sắc<input v-model="textStyle.color" type="color" aria-label="Màu chữ" @input="emit('markTextCustom')" /></label>
        <div class="text-format-row"><span>Căn chỉnh</span><button v-for="alignment in textAlignments" :key="alignment.value" type="button" :class="{ active: textStyle.align === alignment.value }" :aria-label="alignment.label" :aria-pressed="textStyle.align === alignment.value" @click="emit('setTextAlignment', alignment.value)"><component :is="alignment.icon" :size="14" /></button><button type="button" :class="{ active: textStyle.bold }" aria-label="Chữ đậm" :aria-pressed="textStyle.bold" @click="textStyle.bold = !textStyle.bold; activeTextPresetId = null"><Bold :size="14" /></button><button type="button" :class="{ active: textStyle.italic }" aria-label="Chữ nghiêng" :aria-pressed="textStyle.italic" @click="textStyle.italic = !textStyle.italic; activeTextPresetId = null"><Italic :size="14" /></button></div>
        <div class="text-preset-grid" aria-label="Kiểu cài sẵn"><button v-for="preset in TEXT_STYLE_PRESETS" :key="preset.id" type="button" :class="{ active: activeTextPresetId === preset.id }" :aria-label="preset.label" :aria-pressed="activeTextPresetId === preset.id" @click="emit('applyTextPreset', preset)">{{ preset.preview }}</button></div>
      </div>
    </section>
    <section v-else-if="activeLayerKind === 'image'" class="source-properties-panel">
      <header><strong>Chỉnh sửa hình ảnh</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!imageHistoryPastCount" @click="emit('undoInspector')">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!imageHistoryFutureCount" @click="emit('redoInspector')">↷</button></div></header>
      <div class="source-properties-scroll"><label>Bo góc <b>{{ imageRadius }}px</b><input v-model.number="imageRadius" type="range" min="0" max="120" @focus="emit('captureImageEdit')" @change="emit('commitImageEdit')" /></label><label class="property-checkbox">Cắt nền<input v-model="removeImageBackground" type="checkbox" /></label><label :class="{ disabled: !removeImageBackground }">Màu nền<input v-model="backgroundColor" type="color" :disabled="!removeImageBackground" /></label><label :class="{ disabled: !removeImageBackground }">Độ nhạy <b>{{ backgroundSensitivity }}</b><input v-model.number="backgroundSensitivity" type="range" min="0" max="100" :disabled="!removeImageBackground" /></label></div>
    </section>
    <section v-else-if="activeLayerKind === 'avatar'" class="avatar-script-panel">
      <header><strong>Avatar & chuyển động</strong><div class="inspector-history"><button type="button" aria-label="Hoàn tác lớp" :disabled="!avatarHistoryPastCount" @click="emit('undoInspector')">↶</button><button type="button" aria-label="Làm lại lớp" :disabled="!avatarHistoryFutureCount" @click="emit('redoInspector')">↷</button></div></header>
      <div class="avatar-motion-controls">
        <p><b>Chờ</b> là video/GIF lặp khi chưa có lời thoại. Muốn có tiếng, thêm audio vào kịch bản của avatar này rồi phát kịch bản.</p>
        <strong>Video này là</strong>
        <div><button type="button" :class="{ active: activeAvatarState === 'idle' }" @click="emit('setAvatarLayerState', 'idle')">Chờ</button><button type="button" :class="{ active: activeAvatarState === 'talking' }" @click="emit('setAvatarLayerState', 'talking')">Đang nói</button></div>
        <p>Điều khiển phát và audio nằm ở <b>Timeline kịch bản</b> phía dưới.</p>
      </div>
    </section>
    <section v-else class="interaction-panel">
      <header><span>Tương tác</span><b>Ngoại tuyến</b></header>
      <div class="interaction-empty"><CircleStop :size="25" /><strong>Chưa cài đặt livestream</strong><button type="button" @click="emit('openSettings')">Cài đặt</button></div>
    </section>
  </aside>
</template>
