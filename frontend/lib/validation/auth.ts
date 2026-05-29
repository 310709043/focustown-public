import { z } from "zod";

/**
 * Validation messages are stable i18n KEYS, not human text. Each form page
 * resolves them through the `auth.validation` next-intl namespace at render
 * time (`tv(issue.message)`), so the surfaced error follows the active
 * locale instead of leaking the original Chinese. Keep the key set in sync
 * with `messages/{locale}/auth.json → validation`.
 */
const passwordSchema = z
  .string()
  .min(8, "passwordMin")
  .max(128, "passwordMax")
  .regex(/(?=.*[A-Za-z])(?=.*\d)/, "passwordPattern");

export const signUpSchema = z.object({
  displayName: z.string().min(1, "displayNameRequired").max(64),
  email: z.string().email("emailInvalid"),
  password: passwordSchema,
  termsAccepted: z
    .boolean()
    .refine((v) => v === true, { message: "termsRequired" }),
  marketingOptIn: z.boolean(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email("emailInvalid"),
  password: z.string().min(1, "passwordRequired"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("emailInvalid"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16, "tokenInvalid"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordMismatch",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
