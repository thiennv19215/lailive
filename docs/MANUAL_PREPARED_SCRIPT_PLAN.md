# Kế hoạch kịch bản soạn tay và phát media chuẩn bị sẵn

Updated: 2026-08-01

## 1. Mục tiêu

Ưu tiên một workflow manual-first để người vận hành có thể livestream ổn định mà không phụ thuộc TikTok, AI hoặc mạng.

Người dùng chuẩn bị trước các kịch bản `R1`, `R2`, `R3`, ... Mỗi kịch bản có thể:

- phát một video dựng sẵn;
- giữ avatar trên scene và phát một file audio;
- giữ avatar trên scene và đọc nội dung bằng TTS;
- được phát trực tiếp bằng nút hoặc phím tắt;
- chạy tuần tự trong playlist nếu người dùng muốn.

Ví dụ:

```text
R1 - Giới thiệu sản phẩm  -> video intro.mp4
R2 - Trình bày công dụng -> avatar + cong-dung.mp3
R3 - Kêu gọi chốt đơn    -> avatar + nội dung TTS
```

Khi phát audio hoặc TTS, avatar phải chuyển từ `idle` sang `talking`, sau đó trở về `idle` khi âm thanh kết thúc.

## 2. Phạm vi hiện có

Rebuild hiện đã có:

- native picker để thêm video và audio;
- scene layer cho video/audio;
- playlist có thứ tự, tối đa 20 mục;
- bật/tắt và sắp xếp playlist;
- start, pause, resume, skip, stop và retry;
- một media item active tại một thời điểm;
- playback revision guard để bỏ qua callback `ended` cũ;
- Scene Runtime và OBS Browser Source nhận active layer, mute, volume và loop;
- project persistence, migration và import/export cho playlist hiện tại.

Khoảng trống của workflow mong muốn:

- chưa có entity kịch bản độc lập với scene layer;
- chưa thể bấm phát trực tiếp một `R1/R2/R3` bất kỳ;
- chưa có lựa chọn `video`, `audio` hoặc `tts` riêng cho từng kịch bản;
- chưa đồng bộ audio-only playback với avatar `talking`;
- chưa có chính sách interrupt hoặc xếp hàng theo từng kịch bản;
- chưa có hành vi sau khi kịch bản kết thúc;
- chưa có phím tắt vận hành;
- chưa có progress/duration cho kịch bản đang phát.

## 3. Nguyên tắc thiết kế

- Manual playback phải hoạt động khi TikTok, AI hoặc TTS provider bên ngoài không sẵn sàng.
- Không được phát chồng hai nguồn âm thanh do ứng dụng quản lý.
- Kịch bản là dữ liệu project; scene layer chỉ là nguồn hình/âm thanh được kịch bản tham chiếu.
- Mọi thay đổi phải qua schema validation và migration, không làm mất playlist cũ.
- Studio và Browser Source phải dùng cùng playback state và cùng source.
- Stop, project close và app close phải trả avatar về `idle` và giải phóng media.
- TikTok/AI về sau chỉ gọi cùng một API `playScript(scriptId)`, không tạo một playback path riêng.

## 4. Mô hình dữ liệu đề xuất

```ts
export type PreparedScriptPlaybackType = 'video' | 'audio' | 'tts';
export type PreparedScriptInterruptMode = 'immediate' | 'after-current';
export type PreparedScriptCompletionMode = 'stop' | 'next' | 'resume-sequence';

export interface ProjectPreparedScript {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  playbackType: PreparedScriptPlaybackType;
  mediaLayerId: string | null;
  speechText: string;
  interruptMode: PreparedScriptInterruptMode;
  completionMode: PreparedScriptCompletionMode;
}

export interface ProjectPreparedScriptSettings {
  enabled: boolean;
  scripts: ProjectPreparedScript[];
}
```

Quy tắc validation:

- tối đa 20 kịch bản;
- `id` phải duy nhất;
- `order` được chuẩn hóa khi lưu;
- `video` chỉ được tham chiếu video layer;
- `audio` chỉ được tham chiếu audio layer;
- `tts` yêu cầu `speechText` không rỗng;
- video/audio thiếu file vẫn được giữ để người dùng sửa, nhưng không được phát;
- nội dung TTS phải tuân theo giới hạn IPC và TTS hiện có.

## 5. Migration

Migration phải chuyển playlist hiện tại sang prepared scripts mà không làm mất dữ liệu:

```text
playlist item 1 -> R1, playbackType lấy từ layer kind
playlist item 2 -> R2, playbackType lấy từ layer kind
playlist item 3 -> R3, playbackType lấy từ layer kind
```

Yêu cầu:

- giữ nguyên thứ tự và enabled state;
- giữ nguyên layer ID;
- tạo UUID mới cho script ID;
- không xóa `manualPlaybackSettings` cũ cho đến khi migration được kiểm thử đầy đủ;
- export/import project cũ và mới đều phải hoạt động;
- backup project trước migration theo cơ chế persistence hiện có.

## 6. Playback controller

Controller mới cần cung cấp hai entry point:

```ts
startSequence(startScriptId?: string): boolean;
playScript(scriptId: string): boolean;
```

Các trạng thái:

```text
stopped -> loading -> playing -> completed
                    -> paused
                    -> recovering
                    -> error
```

Hành vi bắt buộc:

- `playScript(R2)` có thể phát R2 trực tiếp khi đang dừng;
- `immediate` dừng nội dung hiện tại trước khi phát kịch bản mới;
- `after-current` thêm yêu cầu vào hàng chờ;
- chỉ một video/audio/TTS do controller quản lý được active;
- pause/resume/skip/stop áp dụng nhất quán cho cả ba playback type;
- callback mang revision cũ không được thay đổi playback hiện tại;
- media lỗi có thông báo rõ và không gây deadlock;
- `completionMode: stop` trở về trạng thái chờ;
- `completionMode: next` phát kịch bản enabled tiếp theo;
- `completionMode: resume-sequence` quay lại sequence đã bị ngắt;
- retry phải có giới hạn, không lặp vô hạn với file hỏng.

Snapshot cần bổ sung:

```ts
interface PreparedScriptPlaybackSnapshot {
  mode: 'stopped' | 'loading' | 'playing' | 'paused' | 'recovering' | 'error';
  activeScriptId: string | null;
  activeLayerId: string | null;
  playbackRevision: number;
  queuedScriptIds: string[];
  startedAt: string | null;
  durationMs: number | null;
  positionMs: number;
  errorMessage: string | null;
}
```

## 7. Đồng bộ avatar, audio và OBS

### Video

```text
playScript(video)
-> active video layer
-> Browser Source phát đúng video/audio
-> kết thúc
-> chạy completion mode
```

### Audio

```text
playScript(audio)
-> giữ avatar visible
-> avatarState = talking
-> phát audio layer
-> audio ended/error/stop
-> avatarState = idle
-> chạy completion mode
```

### TTS

```text
playScript(tts)
-> synthesize hoặc dùng cache
-> avatarState = talking
-> phát kết quả qua queue dùng chung
-> kết thúc/cancel/error
-> avatarState = idle
-> chạy completion mode
```

Scene Runtime presentation phải mang ít nhất `activeScriptId`, `activeLayerId`, playback revision, pause, mute, volume và loop. Browser Source chỉ chấp nhận revision mới hơn và phải pause media cũ trước khi kích hoạt media mới.

## 8. Giao diện Studio

Đổi panel playlist hiện tại thành panel `Kịch bản chuẩn bị sẵn`:

```text
R1  Giới thiệu sản phẩm   VIDEO  [Phát]
R2  Công dụng             AUDIO  [Phát]
R3  Chốt đơn              TTS    [Phát]
```

Mỗi kịch bản cần có:

- tên;
- playback type;
- video/audio source hoặc nội dung TTS;
- enabled state;
- interrupt mode;
- completion mode;
- phát ngay;
- đổi thứ tự;
- nhân bản;
- xóa.

Điều khiển chung:

- bắt đầu sequence;
- pause/resume;
- phát tiếp;
- phát lại;
- stop;
- hiển thị kịch bản đang chạy;
- progress và thời gian còn lại;
- lỗi file/provider có recovery action.

Phím tắt dự kiến:

- `1` đến `9`: phát trực tiếp R1 đến R9;
- `Space`: pause/resume;
- `Escape`: stop;
- không xử lý phím tắt khi focus đang ở input, textarea hoặc dialog.

## 9. Kế hoạch triển khai

### Slice A - Contract và migration

- thêm prepared-script contracts;
- thêm Zod schema và giới hạn;
- migration playlist hiện tại;
- cập nhật default project;
- cập nhật import/export tests.

Exit criteria:

- project cũ mở được và tạo đúng R1/R2/R3;
- restart và export/import không mất mapping;
- invalid document bị từ chối hoặc phục hồi an toàn.

### Slice B - Controller phát theo chỉ định

- tách prepared-script controller khỏi UI;
- thêm `playScript(scriptId)` và `startSequence()`;
- immediate/after-current queue;
- completion modes;
- stale revision, missing media và bounded retry.

Exit criteria:

- unit tests chứng minh không overlap;
- có thể phát trực tiếp R2 khi đang dừng;
- R2 có thể ngắt hoặc chờ R1 theo cấu hình;
- stop luôn để controller ở trạng thái sạch.

### Slice C - Studio operator UI

- nâng cấp panel playlist;
- editor cho từng script;
- nút phát trực tiếp;
- status, progress, lỗi và recovery;
- keyboard shortcuts;
- persistence/autosave.

Exit criteria:

- người dùng tạo ba script từ UI mà không dùng DevTools;
- reload route và restart Electron vẫn giữ đầy đủ cấu hình;
- desktop và mobile không overflow.

### Slice D - Avatar/audio/TTS synchronization

- audio start đặt avatar `talking`;
- ended/error/cancel/stop trả avatar về `idle`;
- TTS script dùng queue/provider hiện có;
- clear hoặc project close hủy đúng active work.

Exit criteria:

- audio và TTS đều điều khiển avatar đúng vòng đời;
- không có hai audio active;
- request TTS cũ không phát sau khi đã chuyển script.

### Slice E - Scene Runtime và OBS evidence

- publish prepared-script presentation realtime;
- đồng bộ Studio với Browser Source;
- kiểm tra reconnect snapshot;
- kiểm tra video/audio thật qua OBS;
- kiểm tra Virtual Camera trong consumer thực.

Exit criteria:

- bấm R1/R2/R3 trong Studio tạo đúng hình và tiếng trong OBS;
- Browser Source reconnect tiếp tục đúng trạng thái hiện tại;
- thay source cùng ID không dùng media cache cũ;
- stop/restart không để audio hoặc process mồ côi.

## 10. Test matrix bắt buộc

- tạo, sửa, sắp xếp, nhân bản và xóa script;
- migration playlist cũ sang prepared scripts;
- phát R1 -> R2 -> R3 đúng thứ tự;
- phát trực tiếp R2 khi đang dừng;
- immediate R2 ngắt R1;
- after-current R2 chờ R1;
- completion stop/next/resume-sequence;
- audio start đặt avatar talking;
- audio ended/error/stop đặt avatar idle;
- TTS timeout/cancel không làm kẹt controller;
- không phát chồng audio/video có tiếng;
- stale `ended` callback không dừng script mới;
- file hỏng được bỏ qua hoặc báo lỗi theo policy;
- pause/resume/skip/retry/stop;
- restart và import/export giữ nguyên cấu hình;
- Studio và Browser Source có cùng active script/layer;
- Electron picker với video/audio thật;
- OBS Browser Source và camera consumer nhận đúng hình/tiếng.

## 11. Tiêu chí hoàn thành V1

V1 chỉ được coi là hoàn thành khi:

1. Người dùng thêm được ít nhất ba video/audio từ máy.
2. Người dùng tạo và lưu được R1/R2/R3.
3. Có thể bấm trực tiếp bất kỳ R nào để phát.
4. Video phát đúng hình và tiếng qua OBS.
5. Audio/TTS làm avatar chuyển `idle -> talking -> idle`.
6. Không có hai nguồn âm thanh phát chồng nhau.
7. Pause, resume, skip, stop và lỗi file hoạt động an toàn.
8. Restart Electron và import/export không làm mất kịch bản.
9. Studio và Browser Source hiển thị cùng playback state.
10. Có bằng chứng unit, persistence, Electron và OBS smoke tương ứng.

## 12. Mở rộng sau V1

Sau khi manual-first V1 ổn định, TikTok và AI chỉ cần chọn một prepared script:

```text
TikTok event
-> trigger/filter
-> product/rule matcher
-> chọn scriptId
-> playScript(scriptId)
```

Nếu không có script phù hợp, hệ thống có thể chuyển sang AI reply + TTS hiện có. Manual controls phải tiếp tục hoạt động khi live connector hoặc AI provider mất kết nối.
