export interface RegistrationInput {
  username: string;
  email: string;
  password: string;
  confirmation: string;
}

export function validateRegistration(input: RegistrationInput): string | null {
  if (input.username.trim().length < 3) return 'Tên người dùng tối thiểu 3 ký tự';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return 'Email không hợp lệ';
  if (input.password.length < 6) return 'Mật khẩu tối thiểu 6 ký tự';
  if (input.confirmation !== input.password) return 'Mật khẩu xác nhận không khớp';
  return null;
}
