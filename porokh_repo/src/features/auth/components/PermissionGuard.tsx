import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { MailWarning, ShieldAlert } from "lucide-react";
import HomeSkeleton from "@/features/dashboard/components/HomeSkeleton";

import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "@/shared/i18n/LanguageProvider";

interface PermissionGuardProps {
  children: ReactNode;
  requiredPermission?: string;
  fallback?: ReactNode;
}

function PermissionGuardLoader() {
  return <HomeSkeleton />;
}

function EmailVerificationRequired({ email }: { email?: string | null }) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-6 rounded-full bg-accent/10 p-4">
        <MailWarning className="h-12 w-12 text-accent" aria-hidden="true" />
      </div>

      <h2 className="mb-3 text-2xl font-bold text-text-primary">
        {t('auth.verifyEmailRequired')}
      </h2>

      <p className="mb-6 max-w-md text-[15px] leading-relaxed text-text-secondary">
        {t('auth.verifyEmailIntro')}
        {email ? (
          <strong className="break-all text-primary">{email}</strong>
        ) : (
          t('auth.field.emailWord')
        )}
        {t('auth.verifyEmailOutro')}
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-md transition-all hover:opacity-90 active:scale-95"
      >
        {t('auth.iHaveVerified')}
      </button>
    </div>
  );
}

function AccessDenied() {
  const { t } = useLanguage();

  return (
    <div className="flex h-[60vh] flex-col items-center justify-center p-4 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-accent" aria-hidden="true" />
      <h2 className="text-xl font-bold text-text-primary">{t('auth.accessDenied')}</h2>
      <p className="mt-2 text-text-secondary">{t('auth.noPermission')}</p>
    </div>
  );
}

export function PermissionGuard({
  children,
  requiredPermission,
  fallback,
}: PermissionGuardProps) {
  const { user, role, permissions, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PermissionGuardLoader />;
  }

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  const provider = user.app_metadata?.provider;
  const isOAuthUser = provider && provider !== "email";
  const isEmailVerified = Boolean(user.email_confirmed_at) || Boolean(isOAuthUser);

  if (!isEmailVerified) {
    return <EmailVerificationRequired email={user.email} />;
  }

  const safePermissions = Array.isArray(permissions) ? permissions : [];
  const hasPermission =
    role === "admin" ||
    role === "super_admin" ||
    !requiredPermission ||
    safePermissions.includes(requiredPermission);

  if (!hasPermission) {
    return <>{fallback ?? <AccessDenied />}</>;
  }

  return <>{children}</>;
}
