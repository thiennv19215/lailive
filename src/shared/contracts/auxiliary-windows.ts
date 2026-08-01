export const AUXILIARY_WINDOW_NAMES = [
  'guide',
  'feedback',
  'monitor',
  'payment',
  'user',
  'setup',
  'log',
  'about',
] as const;

export type AuxiliaryWindowName = typeof AUXILIARY_WINDOW_NAMES[number];

export interface AuxiliaryWindowMeta {
  title: string;
  width: number;
  height: number;
}

export const AUXILIARY_WINDOW_META: Record<AuxiliaryWindowName, AuxiliaryWindowMeta> = {
  guide: { title: 'Hướng dẫn', width: 800, height: 542 },
  feedback: { title: 'Phản hồi', width: 700, height: 600 },
  monitor: { title: 'page.monitor.title', width: 702, height: 502 },
  payment: { title: 'Thanh toán', width: 502, height: 400 },
  user: { title: 'Trung tâm người dùng', width: 700, height: 500 },
  setup: { title: 'Khởi tạo', width: 800, height: 542 },
  log: { title: 'Nhật ký', width: 800, height: 600 },
  about: { title: 'Giới thiệu', width: 680, height: 560 },
};

export const MONITOR_CLEAN_PROFILE_STATE = {
  message: 'Đang tải...',
  refreshBlocked: true,
} as const;

export const GUIDE_CLEAN_PROFILE_STATE = {
  message: 'Đang tải...',
} as const;

export const FEEDBACK_CLEAN_PROFILE_STATE = {
  empty: true,
} as const;

export const SETUP_CLEAN_PROFILE_STATE = {
  empty: true,
  leftPaneWidth: 156,
} as const;

export const PAYMENT_CLEAN_PROFILE_STATE = {
  prompt: 'Quét mã WeChat / Alipay',
  qrAvailable: false,
  referenceBridgeResult: 'clone-error',
} as const;

export const USER_CLEAN_PROFILE_STATE = {
  loadingMessage: 'Đang tải...',
  recoveryAction: 'Quay lại',
  errorMessage: 'Tải thất bại, vui lòng kiểm tra mạng',
  refreshAction: 'Làm mới',
  referenceBridgeResult: 'resolved-undefined',
} as const;

export interface AuxiliaryWindowOpenResult {
  name: AuxiliaryWindowName;
  reused: boolean;
}
