import { describe, expect, it } from 'vitest';
import { validateLogin } from '../../src/shared/login-validation';

describe('validateLogin', () => {
  it.each([
    [{ email: '', password: '' }, 'Email không hợp lệ'],
    [{ email: 'invalid', password: 'secret' }, 'Email không hợp lệ'],
    [{ email: 'audit@example.invalid', password: '' }, 'Vui lòng nhập mật khẩu'],
  ])('returns the first actionable validation message', (input, expected) => {
    expect(validateLogin(input)).toBe(expected);
  });

  it('accepts a syntactically valid login input', () => {
    expect(validateLogin({ email: 'audit@example.invalid', password: 'secret' })).toBeNull();
  });
});
