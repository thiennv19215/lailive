export type LoginInput = {
  email: string;
  password: string;
};

export function validateLogin(input: LoginInput): string | null {
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return 'Email không hợp lệ';
  if (!input.password) return 'Vui lòng nhập mật khẩu';
  return null;
}
