import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Minus, Trophy } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { localizeDigits } from '@/shared/i18n/messages';
import { GroupAvatar } from '../components/GroupAvatar';
import { PullToRefresh } from '../components/PullToRefresh';
import { useGroupLeaderboard } from '../hooks/useGroupQueries';
import { resolveGroupErrorMessage } from '../utils/errorMessages';
import type { LeaderboardPeriod } from '../types';

const PERIODS: Array<{ value: LeaderboardPeriod; key: 'groups.weekly' | 'groups.monthly' | 'groups.allTime' }> = [
  { value: 'weekly', key: 'groups.weekly' },
  { value: 'monthly', key: 'groups.monthly' },
  { value: 'all_time', key: 'groups.allTime' },
];

const GroupLeaderboard: React.FC = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const leaderboard = useGroupLeaderboard(period);

  const rows = leaderboard.data?.pages.flatMap((page) => page.items) ?? [];

  const rankChange = (row: (typeof rows)[number]) => {
    if (row.previous_rank === null || row.previous_rank === undefined) {
      return <Minus className="h-3.5 w-3.5 text-text-secondary" />;
    }
    if (row.rank < row.previous_rank) {
      return <ArrowUp className="h-3.5 w-3.5 text-emerald-500" />;
    }
    if (row.rank > row.previous_rank) {
      return <ArrowDown className="h-3.5 w-3.5 text-red-500" />;
    }
    return <Minus className="h-3.5 w-3.5 text-text-secondary" />;
  };

  return (
    <PullToRefresh onRefresh={() => leaderboard.refetch()}>
      <div className="space-y-4 pb-24">
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className="inline-flex items-center gap-2 text-sm text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> {t('groups.title')}
        </button>

        <header className="flex items-center justify-between gap-2">
          <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-text-primary">
            <Trophy className="h-6 w-6 text-primary" /> {t('groups.leaderboard')}
          </h1>
        </header>

        <div className="flex gap-1 rounded-xl border border-border-color p-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                period === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-text-secondary'
              }`}
            >
              {t(option.key)}
            </button>
          ))}
        </div>

        <p className="text-xs text-text-secondary">{t('groups.avgXp')}</p>

        {leaderboard.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : leaderboard.isError ? (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm text-text-secondary">
              {resolveGroupErrorMessage(leaderboard.error, language)}
            </p>
            <Button size="sm" variant="secondary" onClick={() => void leaderboard.refetch()}>
              {t('groups.retry')}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message={t('groups.noResults')} />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <button
                key={`${row.group_id}-${row.period_type}`}
                type="button"
                onClick={() => row.group && navigate(`/groups/${row.group.slug ?? row.group_id}`)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${
                  row.is_my_group
                    ? 'border-primary bg-primary/5'
                    : 'border-card-border bg-card-bg'
                }`}
              >
                <span className="w-8 text-center text-sm font-bold text-text-secondary">
                  {localizeDigits(row.rank, language)}
                </span>
                <GroupAvatar
                  icon={row.group?.icon}
                  name={row.group?.name ?? 'Group'}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-text-primary">
                      {row.group?.name ?? 'Group'}
                    </p>
                    {row.is_my_group && (
                      <Badge className="bg-primary/10 text-primary">{t('groups.mySquad')}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t('groups.avgXp')}: {localizeDigits(Math.round(row.avg_xp), language)} ·{' '}
                    {localizeDigits(row.member_count, language)} {t('groups.members')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-bold text-primary">
                    {localizeDigits(Math.round(row.avg_xp), language)}
                  </span>
                  {rankChange(row)}
                </div>
              </button>
            ))}
          </div>
        )}

        {leaderboard.hasNextPage && (
          <Button
            variant="secondary"
            className="w-full"
            isLoading={leaderboard.isFetchingNextPage}
            onClick={() => void leaderboard.fetchNextPage()}
          >
            {t('groups.loadMore')}
          </Button>
        )}
      </div>
    </PullToRefresh>
  );
};

export default GroupLeaderboard;
