import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, RefreshCw, Search, Trophy, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Input } from '@/shared/components/ui/Input';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { localizeDigits } from '@/shared/i18n/messages';
import { GroupAvatar } from '../components/GroupAvatar';
import { GroupCard } from '../components/GroupCard';
import { PullToRefresh } from '../components/PullToRefresh';
import { useDiscoverGroups, useMyGroups, GROUP_QUERY_KEYS } from '../hooks/useGroupQueries';
import { groupsService } from '../services/groupsService';
import { resolveGroupErrorMessage } from '../utils/errorMessages';
import type { GroupType } from '../types';

const GroupsHub: React.FC = () => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [type, setType] = useState<GroupType | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [search]);

  const myGroups = useMyGroups();
  const discover = useDiscoverGroups({ type, q: debouncedSearch || undefined, page: 1 });

  const joinByCodeMutation = useMutation({
    mutationFn: () => groupsService.joinByCode(code.trim().toUpperCase()),
    onSuccess: (result) => {
      setCode('');
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.me() });
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.all });
      toast.success(
        result.result === 'pending' ? t('groups.pendingSuccess') : t('groups.joinSuccess')
      );
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const joinMutation = useMutation({
    mutationFn: (groupId: string) => groupsService.joinGroup(groupId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.me() });
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.all });
      toast.success(
        result.result === 'pending' ? t('groups.pendingSuccess') : t('groups.joinSuccess')
      );
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const refreshAll = async () => {
    await Promise.all([myGroups.refetch(), discover.refetch()]);
  };

  const squad = myGroups.data?.squad ?? null;
  const communities = myGroups.data?.communities ?? [];
  const pending = myGroups.data?.pending ?? [];

  const myGroupIds = useMemo(
    () =>
      new Set(
        (myGroups.data?.memberships ?? [])
          .filter((row) => ['active', 'pending', 'invited'].includes(row.status))
          .map((row) => row.group_id)
      ),
    [myGroups.data?.memberships]
  );

  const discoverItems = useMemo(
    () => (discover.data?.items ?? []).filter((group) => !myGroupIds.has(group.id)),
    [discover.data?.items, myGroupIds]
  );

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="space-y-6 pb-24">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{t('groups.title')}</h1>
            <p className="text-sm text-text-secondary">{t('groups.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/groups/leaderboard')}>
              <Trophy className="mr-1 h-4 w-4" /> {t('groups.leaderboard')}
            </Button>
            <Button size="sm" onClick={() => navigate('/groups/new')}>
              <Plus className="mr-1 h-4 w-4" /> {t('groups.createSquad')}
            </Button>
          </div>
        </header>

        <section className="rounded-2xl border border-card-border bg-card-bg p-4">
          <h2 className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-text-primary">
            <KeyRound className="h-4 w-4" /> {t('groups.joinWithCode')}
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim().length < 4 || joinByCodeMutation.isPending) return;
              joinByCodeMutation.mutate();
            }}
          >
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 8))}
              placeholder={t('groups.codePlaceholder')}
              maxLength={8}
              autoCapitalize="characters"
            />
            <Button type="submit" isLoading={joinByCodeMutation.isPending}>
              {t('groups.join')}
            </Button>
          </form>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{t('groups.mySquad')}</h2>
            {myGroups.isFetching && !myGroups.isLoading && (
              <RefreshCw className="h-4 w-4 animate-spin text-text-secondary" />
            )}
          </div>

          {myGroups.isLoading ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : squad ? (
            <button
              type="button"
              onClick={() => navigate(`/groups/${squad.group?.slug ?? squad.group_id}`)}
              className="w-full rounded-2xl border border-card-border bg-card-bg p-4 text-left shadow-sm"
            >
              <div className="flex items-center gap-3">
                <GroupAvatar icon={squad.group?.icon} name={squad.group?.name ?? ''} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-text-primary">
                    {squad.group?.name ?? t('groups.mySquad')}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {localizeDigits(squad.group?.member_count ?? 0, language)}/
                    {localizeDigits(squad.group?.max_members ?? 0, language)}{' '}
                    {t('groups.members')} · {t('groups.xp')}{' '}
                    {localizeDigits(squad.contribution_xp ?? 0, language)}
                  </p>
                </div>
                <Badge className="bg-accent/20 text-primary">{t('groups.member')}</Badge>
              </div>
            </button>
          ) : (
            <div className="rounded-2xl border border-dashed border-border-color p-4 text-center">
              <Users className="mx-auto mb-2 h-6 w-6 text-text-secondary" />
              <p className="text-sm text-text-secondary">{t('groups.noSquad')}</p>
            </div>
          )}
        </section>

        {pending.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold text-text-primary">{t('groups.pending')}</h2>
            {pending.map((membership) => (
              <GroupCard
                key={membership.id}
                group={
                  membership.group ?? {
                    id: membership.group_id,
                    slug: membership.group_id,
                    name: membership.group_id,
                    icon: null,
                    description: null,
                    group_type: 'community',
                    max_members: 0,
                    visibility: 'code',
                    member_count: 0,
                    total_xp: 0,
                    group_level: 1,
                    current_streak: 0,
                    last_activity_date: null,
                    is_active: true,
                    created_by: '',
                    created_at: '',
                    updated_at: '',
                  }
                }
                pending
                onOpen={
                  membership.group
                    ? () => navigate(`/groups/${membership.group?.slug ?? membership.group_id}`)
                    : undefined
                }
              />
            ))}
          </section>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary">{t('groups.myCommunities')}</h2>
          </div>
          {communities.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('groups.noCommunities')}</p>
          ) : (
            communities.map((membership) =>
              membership.group ? (
                <GroupCard
                  key={membership.id}
                  group={membership.group}
                  pending={membership.status !== 'active'}
                  onOpen={() => navigate(`/groups/${membership.group?.slug ?? membership.group_id}`)}
                />
              ) : null
            )
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-text-primary">{t('groups.discover')}</h2>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('groups.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1 rounded-xl border border-border-color p-1">
              {[
                { value: undefined, label: t('groups.filterAll') },
                { value: 'squad' as const, label: t('groups.filterSquads') },
                { value: 'community' as const, label: t('groups.filterCommunities') },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    type === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-text-secondary'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {discover.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
            </div>
          ) : discover.isError ? (
            <div className="py-6 text-center">
              <p className="mb-2 text-sm text-text-secondary">
                {resolveGroupErrorMessage(discover.error, language)}
              </p>
              <Button size="sm" variant="secondary" onClick={() => void discover.refetch()}>
                {t('groups.retry')}
              </Button>
            </div>
          ) : discoverItems.length === 0 ? (
            <EmptyState message={t('groups.noResults')} />
          ) : (
            discoverItems.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onOpen={() => navigate(`/groups/${group.slug ?? group.id}`)}
                actionLabel={
                  group.visibility === 'approval'
                    ? t('groups.requestAction')
                    : t('groups.joinAction')
                }
                onAction={() => joinMutation.mutate(group.id)}
                actionDisabled={joinMutation.isPending || group.member_count >= group.max_members}
              />
            ))
          )}
        </section>
      </div>
    </PullToRefresh>
  );
};

export default GroupsHub;
