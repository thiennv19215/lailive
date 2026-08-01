import { describe, expect, it } from 'vitest';
import { validateRegistration } from '../../src/shared/auth-validation';

describe('registration validation', () => {
  it.each([
    [{ username: 'a', email: '', password: '', confirmation: '' }, 'Tên người dùng tối thiểu 3 ký tự'],
    [{ username: 'audit', email: 'invalid', password: '', confirmation: '' }, 'Email không hợp lệ'],
    [{ username: 'audit', email: 'fixture@example.invalid', password: '123', confirmation: '' }, 'Mật khẩu tối thiểu 6 ký tự'],
    [{ username: 'audit', email: 'fixture@example.invalid', password: '123456', confirmation: '123457' }, 'Mật khẩu xác nhận không khớp'],
  ])('returns the first reference-shaped error', (input, message) => {
    expect(validateRegistration(input)).toBe(message);
  });

  it('accepts a complete synthetic form', () => {
    expect(validateRegistration({
      username: 'audit',
      email: 'fixture@example.invalid',
      password: '123456',
      confirmation: '123456',
    })).toBeNull();
  });
});
