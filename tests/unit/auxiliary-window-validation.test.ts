import { describe, expect, it } from 'vitest';
import {
  AUXILIARY_WINDOW_NAMES,
  FEEDBACK_CLEAN_PROFILE_STATE,
  GUIDE_CLEAN_PROFILE_STATE,
  MONITOR_CLEAN_PROFILE_STATE,
  PAYMENT_CLEAN_PROFILE_STATE,
  SETUP_CLEAN_PROFILE_STATE,
  USER_CLEAN_PROFILE_STATE,
} from '../../src/shared/contracts/auxiliary-windows';
import { auxiliaryWindowNameSchema } from '../../src/shared/validation/auxiliary-window';

describe('auxiliary window contract', () => {
  it('accepts every confirmed reference window name', () => {
    for (const name of AUXILIARY_WINDOW_NAMES) expect(auxiliaryWindowNameSchema.parse(name)).toBe(name);
  });

  it('rejects unconfirmed window names', () => {
    expect(auxiliaryWindowNameSchema.safeParse('diagnostics').success).toBe(false);
    expect(auxiliaryWindowNameSchema.safeParse('../guide').success).toBe(false);
  });

  it('keeps the clean-profile monitor behind its confirmed blocking loading state', () => {
    expect(MONITOR_CLEAN_PROFILE_STATE).toEqual({
      message: 'Đang tải...',
      refreshBlocked: true,
    });
  });

  it('records the confirmed Guide loading and Feedback empty states', () => {
    expect(GUIDE_CLEAN_PROFILE_STATE).toEqual({ message: 'Đang tải...' });
    expect(FEEDBACK_CLEAN_PROFILE_STATE).toEqual({ empty: true });
  });

  it('records the confirmed Setup split and Payment unavailable-QR states', () => {
    expect(SETUP_CLEAN_PROFILE_STATE).toEqual({ empty: true, leftPaneWidth: 156 });
    expect(PAYMENT_CLEAN_PROFILE_STATE).toEqual({
      prompt: 'Quét mã WeChat / Alipay',
      qrAvailable: false,
      referenceBridgeResult: 'clone-error',
    });
  });

  it('records the confirmed User loading, recovery, and network-error states', () => {
    expect(USER_CLEAN_PROFILE_STATE).toEqual({
      loadingMessage: 'Đang tải...',
      recoveryAction: 'Quay lại',
      errorMessage: 'Tải thất bại, vui lòng kiểm tra mạng',
      refreshAction: 'Làm mới',
      referenceBridgeResult: 'resolved-undefined',
    });
  });
});
