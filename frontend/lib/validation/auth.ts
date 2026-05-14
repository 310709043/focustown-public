import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "至少 8 個字元")
  .max(128, "最多 128 個字元")
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, "需含英文字母與數字");

export const signUpSchema = z.object({
  displayName: z.string().min(1, "請輸入顯示名稱").max(64),
  email: z.string().email("email 格式錯誤"),
  password: passwordSchema,
  termsAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "請同意服務條款與隱私政策" }),
  marketingOptIn: z.boolean(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email("email 格式錯誤"),
  password: z.string().min(1, "請輸入密碼"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("email 格式錯誤"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, "重設連結無效"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "兩次輸入的密碼不一致",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
