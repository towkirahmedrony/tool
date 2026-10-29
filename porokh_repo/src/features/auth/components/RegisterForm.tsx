import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

import { supabase } from "@/shared/lib/supabase";
import { buildApiUrl } from "@/shared/lib/apiConfig";
import { isValidUsername, normalizeUsername } from "../utils/username";
import { useLanguage } from "@/shared/i18n/LanguageProvider";
import type { AppMessageKey } from "@/shared/i18n/messages";

interface RegisterFormProps {
  onSuccess: (email: string) => void;
  defaultRefCode?: string | null;
}

type RegisterFormData = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

type NormalizedRegisterData = {
  fullName: string;
  username: string;
  email: string;
  password: string;
};

/** A message is kept as a key plus its interpolation values so the rendered
 * text always follows the active language. */
type FormMessage = {
  key: AppMessageKey;
  values?: Record<string, string | number>;
};

const INITIAL_FORM_DATA: RegisterFormData = {
  fullName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FULL_NAME_LENGTH = 80;
const MAX_USERNAME_LENGTH = 20;
const MIN_USERNAME_LENGTH = 3;

function normalizeRegisterData(userData: RegisterFormData): NormalizedRegisterData {
  return {
    fullName: userData.fullName.trim().replace(/\s+/g, " "),
    username: normalizeUsername(userData.username),
    email: userData.email.trim().toLowerCase(),
    password: userData.password,
  };
}

function getRegisterErrorMessage(error: unknown): FormMessage {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("profiles_username_key") ||
    message.includes("duplicate key value") ||
    (message.includes("username") && message.includes("duplicate"))
  ) {
    return { key: "auth.register.usernameTaken" };
  }

  if (
    message.includes("user already registered") ||
    message.includes("already registered") ||
    (message.includes("email") && message.includes("already"))
  ) {
    return { key: "auth.register.blocked" };
  }

  if (message.includes("valid_username") || message.includes("username")) {
    return { key: "auth.register.usernameFormat" };
  }

  if (message.includes("password")) {
    return { key: "auth.register.weakPassword", values: { min: MIN_PASSWORD_LENGTH } };
  }

  return { key: "auth.register.failed" };
}

export default function RegisterForm({
  onSuccess,
  defaultRefCode,
}: RegisterFormProps) {
  const { t } = useLanguage();
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState<FormMessage | null>(null);
  const [formData, setFormData] = useState<RegisterFormData>(INITIAL_FORM_DATA);

  const registerMutation = useMutation({
    mutationFn: async (userData: RegisterFormData) => {
      const normalizedData = normalizeRegisterData(userData);

      const { data, error } = await supabase.auth.signUp({
        email: normalizedData.email,
        password: normalizedData.password,
        options: {
          data: {
            full_name: normalizedData.fullName,
            username: normalizedData.username,
            referred_by_code: defaultRefCode?.trim() || null,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.user?.identities && data.user.identities.length === 0) {
        throw new Error("user already registered");
      }

      return {
        ...data,
        submittedEmail: normalizedData.email,
      };
    },
    onSuccess: async (data) => {
      // 🚀 [NEW] IP Address ও Device Info ব্যাকএন্ডে সেভ করার জন্য API Call
      if (data.user) {
        try {
          const backendUrl = buildApiUrl('/auth/save-device');
          await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: data.user.id,
              device_name: /Mobile|Android|iP(hone|od|ad)/.test(navigator.userAgent) ? 'Mobile Device' : 'Desktop/Laptop',
              os_or_browser: navigator.userAgent
            })
          });
        } catch (err) {
          console.error('IP saving process failed:', err);
        }
        
        onSuccess(data.submittedEmail);
      }
    },
    onError: (error) => {
      setCustomError(getRegisterErrorMessage(error));
    },
  });

  const isPending = registerMutation.isPending;
  const errorId = customError ? "register-form-error" : undefined;

  const updateField = (field: keyof RegisterFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === "username" ? value.trim().toLowerCase() : value,
    }));

    if (customError) {
      setCustomError(null);
    }
  };

  const validateForm = (): FormMessage | null => {
    const normalizedData = normalizeRegisterData(formData);
    const confirmPassword = formData.confirmPassword;

    if (!normalizedData.fullName) {
      return { key: "auth.register.nameRequired" };
    }

    if (normalizedData.fullName.length < 2) {
      return { key: "auth.register.nameMin" };
    }

    if (normalizedData.fullName.length > MAX_FULL_NAME_LENGTH) {
      return { key: "auth.register.nameMax", values: { max: MAX_FULL_NAME_LENGTH } };
    }

    if (!normalizedData.username) {
      return { key: "auth.register.usernameRequired" };
    }

    if (normalizedData.username.length < MIN_USERNAME_LENGTH) {
      return { key: "auth.register.usernameMin", values: { min: MIN_USERNAME_LENGTH } };
    }

    if (normalizedData.username.length > MAX_USERNAME_LENGTH) {
      return { key: "auth.register.usernameMax", values: { max: MAX_USERNAME_LENGTH } };
    }

    if (!isValidUsername(normalizedData.username)) {
      return { key: "auth.register.usernameFormat" };
    }

    if (!normalizedData.email) {
      return { key: "auth.register.emailRequired" };
    }

    if (!EMAIL_PATTERN.test(normalizedData.email)) {
      return { key: "auth.register.emailInvalid" };
    }

    if (normalizedData.password.length < MIN_PASSWORD_LENGTH) {
      return { key: "auth.register.passwordMin", values: { min: MIN_PASSWORD_LENGTH } };
    }

    if (normalizedData.password !== confirmPassword) {
      return { key: "auth.register.passwordMismatch" };
    }

    return null;
  };

  const handleRegister = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCustomError(null);

    const validationError = validateForm();

    if (validationError) {
      setCustomError(validationError);
      return;
    }

    registerMutation.mutate(formData);
  };

  const inputClasses =
    "w-full rounded-xl border border-input-border bg-input-bg px-4 py-3 text-base text-text-primary transition-colors placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <div className="w-full">
      {customError && (
        <div
          id="register-form-error"
          role="alert"
          aria-live="polite"
          className="mb-3 flex items-start gap-2 rounded-xl border border-border-color bg-surface-elevated p-2.5 text-sm text-text-primary"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-primary"
            aria-hidden="true"
          />
          <p className="font-medium leading-5">{t(customError.key, customError.values)}</p>
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-3" noValidate>
        <input
          id="register-full-name"
          type="text"
          required
          autoComplete="name"
          maxLength={MAX_FULL_NAME_LENGTH}
          disabled={isPending}
          className={inputClasses}
          placeholder={t('auth.field.fullName')}
          value={formData.fullName}
          onChange={(event) => updateField("fullName", event.target.value)}
          aria-invalid={Boolean(customError)}
          aria-describedby={errorId}
        />

        <input
          id="register-username"
          type="text"
          required
          autoComplete="username"
          inputMode="text"
          pattern="[a-z0-9_]+"
          minLength={MIN_USERNAME_LENGTH}
          maxLength={MAX_USERNAME_LENGTH}
          disabled={isPending}
          className={`${inputClasses} lowercase`}
          placeholder={t('auth.register.usernamePlaceholder')}
          value={formData.username}
          onChange={(event) => updateField("username", event.target.value)}
          aria-invalid={Boolean(customError)}
          aria-describedby={errorId}
        />

        <input
          id="register-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          disabled={isPending}
          className={inputClasses}
          placeholder={t('auth.field.email')}
          value={formData.email}
          onChange={(event) => updateField("email", event.target.value)}
          aria-invalid={Boolean(customError)}
          aria-describedby={errorId}
        />

        <div className="relative">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            disabled={isPending}
            className={`${inputClasses} pr-12`}
            placeholder={t('auth.register.passwordPlaceholder', { min: MIN_PASSWORD_LENGTH })}
            value={formData.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={Boolean(customError)}
            aria-describedby={errorId}
          />

          <button
            type="button"
            disabled={isPending}
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:cursor-not-allowed"
            aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPasswordAlt')}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Eye className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        <input
          id="register-confirm-password"
          type={showPassword ? "text" : "password"}
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={isPending}
          className={inputClasses}
          placeholder={t('auth.field.confirmPassword')}
          value={formData.confirmPassword}
          onChange={(event) => updateField("confirmPassword", event.target.value)}
          aria-invalid={Boolean(customError)}
          aria-describedby={errorId}
        />

        <button
          type="submit"
          disabled={isPending}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3.5 text-lg font-bold text-primary-foreground transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>{t('auth.signingUp')}</span>
            </>
          ) : (
            t('auth.signUp')
          )}
        </button>
      </form>
    </div>
  );
}
