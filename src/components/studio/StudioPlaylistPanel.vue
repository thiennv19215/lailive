<script setup lang="ts">
import type { PreparedScriptPlaybackSnapshot } from '../../modules/playback/prepared-script-playback';
import type { ProjectPreparedScript, ProjectSceneLayer } from '../../shared/contracts/projects';

defineProps<{ enabled: boolean; snapshot: PreparedScriptPlaybackSnapshot; scripts: ProjectPreparedScript[]; layers: ProjectSceneLayer[]; sourceDisplayName: (layer: ProjectSceneLayer) => string; }>();
const emit = defineEmits<{ add: [type: 'video' | 'audio' | 'tts', layerId?: string]; pickAudio: [scriptId: string]; play: [scriptId: string]; start: []; pause: []; resume: []; skip: []; stop: []; toggle: []; move: [index: number, delta: number]; remove: [index: number]; changed: []; }>();
</script>

<template>
  <section class="source-panel playlist-panel">
    <p class="playlist-state">Hàng tự chạy tạm dừng khi có phản hồi. Các câu chào và tư vấn phát theo hàng đợi, sau đó mục tự chạy tiếp tục đúng vị trí.</p>
    <header><strong>Kịch bản Timeline</strong><button type="button" class="switch" :class="{ on: enabled }" :aria-pressed="enabled" @click="emit('toggle')"><span /></button></header>
    <p class="playlist-state">{{ snapshot.mode }}<span v-if="snapshot.activeScriptId"> · Đang phát {{ scripts.find((script) => script.id === snapshot.activeScriptId)?.name }}</span></p>
    <div class="playlist-controls">
      <button type="button" :disabled="!enabled || snapshot.mode !== 'stopped'" @click="emit('start')">Chạy lần lượt</button><button type="button" :disabled="snapshot.mode !== 'playing'" @click="emit('pause')">Tạm dừng</button><button type="button" :disabled="snapshot.mode !== 'paused'" @click="emit('resume')">Tiếp tục</button><button type="button" :disabled="!snapshot.activeScriptId" @click="emit('skip')">Bỏ qua</button><button type="button" :disabled="snapshot.mode === 'stopped'" @click="emit('stop')">Dừng</button>
    </div>
    <p v-if="snapshot.errorMessage" class="playlist-error">{{ snapshot.errorMessage }}</p>
    <ol class="prepared-script-list">
      <li v-for="(script, index) in scripts" :key="script.id" :class="{ active: snapshot.activeScriptId === script.id }">
        <div class="prepared-script-title"><b>R{{ index + 1 }}</b><input v-model="script.name" maxlength="120" @change="emit('changed')" /><button type="button" :disabled="!enabled || !script.enabled" @click="emit('play', script.id)">Phát</button></div>
        <div class="prepared-script-fields">
          <label>Chế độ<select v-model="script.role" @change="emit('changed')"><option value="idle">Tự chạy</option><option value="activation">Kích hoạt</option><option value="conversation">Đang nói</option></select></label>
          <label>Loại<select v-model="script.playbackType" @change="script.mediaLayerId = script.playbackType === 'tts' ? null : script.mediaLayerId; emit('changed')"><option value="video">Video</option><option value="audio">Thoại file</option><option value="tts">TTS</option></select></label>
          <label v-if="script.playbackType !== 'tts'">Nguồn<select v-model="script.mediaLayerId" @change="emit('changed')"><option :value="null">Chọn nguồn</option><option v-for="layer in layers.filter((item) => item.kind === script.playbackType)" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
          <label v-if="script.playbackType === 'video'">Audio kèm<select v-model="script.audioLayerId" @change="emit('changed')"><option :value="null">Không có</option><option v-for="layer in layers.filter((item) => item.kind === 'audio')" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
          <button v-if="script.playbackType === 'audio'" type="button" class="prepared-script-import" @click="emit('pickAudio', script.id)">Chọn file audio</button>
          <label v-else class="prepared-script-text">Nội dung thoại<textarea v-model="script.speechText" maxlength="5000" placeholder="Nhập lời thoại TTS..." @change="emit('changed')" /></label>
          <label>Avatar VAS<select v-model="script.avatarLayerId" @change="emit('changed')"><option :value="null">Không dùng avatar</option><option v-for="layer in layers.filter((item) => item.kind === 'avatar')" :key="layer.id" :value="layer.id">{{ sourceDisplayName(layer) }}</option></select></label>
          <label>Ngắt<select v-model="script.interruptMode" @change="emit('changed')"><option value="immediate">Phát ngay</option><option value="after-current">Chờ kịch bản hiện tại</option></select></label>
          <label>Sau khi xong<select v-model="script.completionMode" @change="emit('changed')"><option value="stop">Dừng</option><option value="next">Kịch bản tiếp</option><option value="resume-sequence">Tiếp tục chuỗi</option></select></label>
        </div>
        <div class="prepared-script-actions"><button type="button" @click="script.enabled = !script.enabled; emit('changed')">{{ script.enabled ? 'Bật' : 'Tắt' }}</button><button type="button" :disabled="index === 0" @click="emit('move', index, -1)">↑</button><button type="button" :disabled="index === scripts.length - 1" @click="emit('move', index, 1)">↓</button><button type="button" @click="emit('remove', index)">Xóa</button></div>
      </li>
    </ol>
    <div class="playlist-add-list"><button v-for="layer in layers.filter((item) => item.kind === 'video')" :key="layer.id" type="button" @click="emit('add', 'video', layer.id)">+ Video: {{ sourceDisplayName(layer) }}</button><button v-for="layer in layers.filter((item) => item.kind === 'audio')" :key="layer.id" type="button" @click="emit('add', 'audio', layer.id)">+ Audio: {{ sourceDisplayName(layer) }}</button><button type="button" @click="emit('add', 'tts')">+ Thoại TTS</button></div>
  </section>
</template>
