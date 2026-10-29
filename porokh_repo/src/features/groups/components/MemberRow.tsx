import React from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { localizeDigits } from '@/shared/i18n/messages';
import type { GroupMembership } from '../types';

type MemberRowProps = {
  membership: GroupMembership;
  rank?: number;
  canKick?: boolean;
  showKick?: boolean;
  onKick?: () => void;
  isPendingRequest?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
};

export const MemberRow: React.FC<MemberRowProps> = ({
  membership,
  rank,
  canKick,
  showKick,
  onKick,
  isPendingRequest,
  onApprove,
  onReject,
}) => {
  const { language, t } = useLanguage();
  const profile = membership.profile;
  const name = profile?.full_name || profile?.username || 'Student';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-card-border bg-card-bg p-3">
      {typeof rank === 'number' && (
        <span className="w-6 text-center text-sm font-bold text-text-secondary">
          {localizeDigits(rank, language)}
        </span>
      )}

      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={name}
          className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
          {initial}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-text-primary">{name}</p>
          {membership.role === 'admin' && (
            <Badge className="bg-accent/20 text-primary">
              {t('groups.admin')}
            </Badge>
          )}
        </div>
        <p className="text-xs text-text-secondary">
          {t('groups.xp')}: {localizeDigits(membership.contribution_xp ?? 0, language)}
          {profile?.institution ? ` · ${profile.institution}` : ''}
        </p>
      </div>

      {isPendingRequest && (
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove}>
            {t('groups.approve')}
          </Button>
          <Button size="sm" variant="secondary" onClick={onReject}>
            {t('groups.reject')}
          </Button>
        </div>
      )}

      {showKick && canKick && (
        <Button size="sm" variant="danger" onClick={onKick}>
          {t('groups.kick')}
        </Button>
      )}
    </div>
  );
};

export default MemberRow;
