import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Flame,
  LogOut,
  RefreshCw,
  Settings,
  Share2,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Input } from '@/shared/components/ui/Input';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import ConfirmModal from '@/shared/components/feedback/ConfirmModal';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { localizeDigits } from '@/shared/i18n/messages';
import { GroupAvatar } from '../components/GroupAvatar';
import { GroupChat } from '../components/GroupChat';
import { MemberRow } from '../components/MemberRow';
import { BattleCreateForm } from '../components/BattleCreateForm';
import { BattleList } from '../components/BattleList';
import { PullToRefresh } from '../components/PullToRefresh';
import {
  useGroupBattles,
  useGroupDetail,
  useGroupsConfig,
  GROUP_QUERY_KEYS,
} from '../hooks/useGroupQueries';
import { groupsService } from '../services/groupsService';
import { resolveGroupErrorMessage } from '../utils/errorMessages';
import { serverOffsetMs } from '../utils/battleState';
import { groupShareUrl, isGroupUuid } from '../utils/groupSlug';

type Tab = 'overview' | 'members' | 'chat' | 'battles' | 'settings';

const TABS: Tab[] = ['overview', 'members', 'chat', 'battles'];

const isTab = (value: string | null): value is Tab =>
  value === 'overview' ||
  value === 'members' ||
  value === 'chat' ||
  value === 'battles' ||
  value === 'settings';


const GroupDetail: React.FC = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: Tab = isTab(rawTab) ? rawTab : 'overview';

  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState(() =>
    (searchParams.get('code') ?? '').toUpperCase()
  );
  const [showBattleForm, setShowBattleForm] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'code' | 'approval'>('code');
  const [maxMembers, setMaxMembers] = useState(2);

  const detail = useGroupDetail(groupId);
  const battles = useGroupBattles(groupId);
  const { data: config } = useGroupsConfig();

  const group = detail.data?.group;
  const isAdmin = detail.data?.isAdmin ?? false;
  const isOwner = detail.data?.isOwner ?? false;
  const isMember = detail.data?.isActiveMember ?? false;
  const membershipStatus = detail.data?.myMembership?.status;
  const isPending =
    membershipStatus === 'pending' || membershipStatus === 'invited';

  useEffect(() => {
    setNowMs(Date.now() + serverOffsetMs(battles.data?.serverNow));
    const timer = window.setInterval(() => {
      setNowMs(Date.now() + serverOffsetMs(battles.data?.serverNow));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [battles.data?.serverNow]);

  useEffect(() => {
    if (!group) return;
    setName(group.name);
    setSlug(group.slug ?? '');
    setIcon(group.icon ?? '');
    setDescription(group.description ?? '');
    setVisibility(group.visibility);
    setMaxMembers(group.max_members);
  }, [group]);

  useEffect(() => {
    if (!group?.slug || !groupId || groupId === group.slug) return;
    if (!isGroupUuid(groupId) && groupId.toLowerCase() === group.slug.toLowerCase()) {
      const suffix = searchParams.toString();
      navigate(`/groups/${group.slug}${suffix ? `?${suffix}` : ''}`, { replace: true });
      return;
    }
    if (isGroupUuid(groupId)) {
      const suffix = searchParams.toString();
      navigate(`/groups/${group.slug}${suffix ? `?${suffix}` : ''}`, { replace: true });
    }
  }, [group?.slug, groupId, navigate, searchParams]);

  const requests = useQuery({
    queryKey: [...GROUP_QUERY_KEYS.detail(groupId ?? ''), 'requests'],
    queryFn: () => groupsService.getJoinRequests(groupId as string),
    enabled: Boolean(groupId) && isAdmin,
    staleTime: 1000 * 20,
  });

  const invalidateGroup = () => {
    void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.detail(groupId ?? '') });
    void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.me() });
    void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.all });
  };

  const joinMutation = useMutation({
    mutationFn: (code?: string | null) =>
      groupsService.joinGroup(group?.id ?? (groupId as string), code ?? undefined),
    onSuccess: (result) => {
      invalidateGroup();
      toast.success(
        result.result === 'pending' ? t('groups.pendingSuccess') : t('groups.joinSuccess')
      );
      if (result.result === 'joined') {
        setSearchParams({ tab: 'overview' });
      }
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const leaveMutation = useMutation({
    mutationFn: () => groupsService.leaveGroup(groupId as string),
    onSuccess: () => {
      invalidateGroup();
      toast.success(t('groups.leaveSuccess'));
      navigate('/groups', { replace: true });
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      groupsService.updateGroup(groupId as string, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        icon: icon || null,
        description: description.trim() || null,
        visibility,
        maxMembers,
      }),
    onSuccess: () => {
      invalidateGroup();
      toast.success(t('groups.saved'));
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const joinCodeMutation = useMutation({
    mutationFn: () => groupsService.getJoinCode(groupId as string),
    onSuccess: (data) => setJoinCode(data.joinCode),
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      groupsService.updateGroup(groupId as string, { regenerateJoinCode: true }),
    onSuccess: () => {
      setJoinCode(null);
      joinCodeMutation.mutate();
      invalidateGroup();
      toast.success(t('groups.saved'));
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const disbandMutation = useMutation({
    mutationFn: () => groupsService.updateGroup(groupId as string, { disband: true }),
    onSuccess: () => {
      invalidateGroup();
      toast.success(t('groups.disbanded'));
      navigate('/groups', { replace: true });
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const kickMutation = useMutation({
    mutationFn: (memberId: string) => groupsService.kickMember(groupId as string, memberId),
    onSuccess: () => {
      invalidateGroup();
      toast.success(t('groups.banned'));
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ memberId, approve }: { memberId: string; approve: boolean }) =>
      groupsService.reviewJoinRequest(groupId as string, memberId, approve),
    onSuccess: () => {
      invalidateGroup();
      void requests.refetch();
      toast.success(t('groups.saved'));
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const battleJoinMutation = useMutation({
    mutationFn: (battleId: string) => groupsService.joinBattle(battleId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.battles(groupId ?? '') });
      navigate(`/groups/${group?.slug ?? groupId}/battles/${data.battle_id}`);
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const battleCancelMutation = useMutation({
    mutationFn: (battleId: string) => groupsService.cancelBattle(battleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUP_QUERY_KEYS.battles(groupId ?? '') });
      toast.success(t('groups.cancelled'));
    },
    onError: (error) => toast.error(resolveGroupErrorMessage(error, language)),
  });

  const members = useMemo(() => detail.data?.members ?? [], [detail.data?.members]);
  const pendingRequests = requests.data?.requests ?? [];

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (detail.isError && !group) {
    return (
      <div className="space-y-4 py-10 text-center">
        <EmptyState message={resolveGroupErrorMessage(detail.error, language)} />
        <Button variant="secondary" onClick={() => navigate('/groups')}>
          {t('groups.backToGroup')}
        </Button>
      </div>
    );
  }

  if (!group) return null;

  const inviteIdentifier = group.slug ?? group.id;

  const shareGroup = async (withCode = false) => {
    try {
      let code: string | null = null;
      if (withCode) {
        const result = await groupsService.getJoinCode(group.id);
        code = result.joinCode || null;
      }
      const url = groupShareUrl(inviteIdentifier, code);
      const text = t('groups.shareMessage', { name: group.name });
      if (navigator.share) {
        await navigator.share({ title: group.name, text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success(t('groups.linkCopied'));
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      toast.error(t('groups.shareFailed'));
    }
  };

  const setTab = (next: Tab) => setSearchParams({ tab: next });

  return (
    <PullToRefresh onRefresh={async () => {
      await detail.refetch();
      await battles.refetch();
    }}>
      <div className="space-y-4 pb-24">
        <button
          type="button"
          onClick={() => navigate('/groups')}
          className="inline-flex items-center gap-2 text-sm text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> {t('groups.title')}
        </button>

        <header className="rounded-2xl border border-card-border bg-card-bg p-4">
          <div className="flex items-start gap-3">
            <GroupAvatar icon={group.icon} name={group.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary">{group.name}</h1>
                <Badge className="bg-secondary text-text-secondary">
                  {group.group_type === 'squad'
                    ? t('groups.filterSquads')
                    : t('groups.filterCommunities')}
                </Badge>
              </div>
              {group.description && (
                <p className="mt-1 text-sm text-text-secondary">{group.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {localizeDigits(group.member_count, language)}/
                  {localizeDigits(group.max_members, language)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Trophy className="h-3.5 w-3.5" />
                  {t('groups.totalXp')} {localizeDigits(group.total_xp, language)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5" />
                  {t('groups.streak')} {localizeDigits(group.current_streak, language)}
                </span>
                <span>
                  {t('groups.level')} {localizeDigits(group.group_level, language)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!isMember && !isPending && membershipStatus !== 'kicked' && group.is_active && group.visibility === 'code' && (
              <div className="flex w-full flex-wrap items-center gap-2">
                <Input
                  value={joinCodeInput}
                  onChange={(event) =>
                    setJoinCodeInput(event.target.value.toUpperCase().slice(0, 16))
                  }
                  placeholder={t('groups.enterCode')}
                  className="max-w-[220px]"
                />
                <Button
                  size="sm"
                  isLoading={joinMutation.isPending}
                  disabled={!joinCodeInput.trim()}
                  onClick={() => joinMutation.mutate(joinCodeInput.trim())}
                >
                  {t('groups.joinAction')}
                </Button>
              </div>
            )}
            {!isMember && !isPending && membershipStatus !== 'kicked' && group.is_active && group.visibility !== 'code' && (
              <Button
                size="sm"
                isLoading={joinMutation.isPending}
                disabled={Number(group.member_count) >= Number(group.max_members)}
                onClick={() => joinMutation.mutate(null)}
              >
                {Number(group.member_count) >= Number(group.max_members)
                  ? t('groups.fullGroup')
                  : group.visibility === 'approval'
                    ? t('groups.requestAction')
                    : t('groups.joinAction')}
              </Button>
            )}
            {membershipStatus === 'kicked' && (
              <p className="text-sm text-red-500">{t('groups.statusKicked')}</p>
            )}
            {(isMember || isPending) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  setConfirm({
                    title: isPending ? t('groups.pending') : t('groups.leave'),
                    message: t('groups.leaveConfirm'),
                    onConfirm: () => leaveMutation.mutate(),
                  })
                }
              >
                <LogOut className="mr-1 h-4 w-4" /> {t('groups.leave')}
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void shareGroup(false)}>
              <Share2 className="mr-1 h-4 w-4" /> {t('groups.share')}
            </Button>
            {isOwner && group.visibility === 'code' && (
              <Button size="sm" variant="ghost" onClick={() => void shareGroup(true)}>
                {t('groups.shareCode')}
              </Button>
            )}
            {isOwner && (
              <Button size="sm" variant="ghost" onClick={() => setTab('settings')}>
                <Settings className="mr-1 h-4 w-4" /> {t('groups.settings')}
              </Button>
            )}
          </div>
        </header>

        {searchParams.get('created') === '1' && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="font-semibold text-text-primary">{t('groups.shareCreatedTitle')}</p>
            <p className="mt-1 text-sm text-text-secondary">{t('groups.shareCreatedBody')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void shareGroup(false)}>
                <Share2 className="mr-1 h-4 w-4" /> {t('groups.share')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('created');
                  setSearchParams(next, { replace: true });
                }}
              >
                {t('groups.openGroup')}
              </Button>
            </div>
          </div>
        )}

        {!isMember && !isPending && (
          <div className="rounded-2xl border border-card-border bg-card-bg p-4">
            <p className="text-sm font-semibold text-text-primary">{t('groups.previewAbout')}</p>
            <p className="mt-1 text-sm text-text-secondary">
              {group.description || t('groups.noResults')}
            </p>
          </div>
        )}

        {isMember && (
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border-color p-1">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  tab === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-text-secondary'
                }`}
              >
                {value === 'overview'
                  ? t('groups.overview')
                  : value === 'members'
                    ? t('groups.membersTab')
                    : value === 'chat'
                      ? t('groups.chat')
                      : t('groups.battles')}
              </button>
            ))}
          </div>
        )}

        {tab === 'overview' && (
          <section className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-card-border bg-card-bg p-4">
                <p className="text-xs text-text-secondary">{t('groups.members')}</p>
                <p className="text-2xl font-bold text-primary">
                  {localizeDigits(group.member_count, language)}
                </p>
              </div>
              <div className="rounded-2xl border border-card-border bg-card-bg p-4">
                <p className="text-xs text-text-secondary">{t('groups.totalXp')}</p>
                <p className="text-2xl font-bold text-primary">
                  {localizeDigits(group.total_xp, language)}
                </p>
              </div>
            </div>

            {isOwner && (
              <div className="rounded-2xl border border-card-border bg-card-bg p-4">
                <p className="text-sm font-semibold text-text-primary">{t('groups.joinCode')}</p>
                {joinCode ? (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-secondary px-3 py-2 text-center text-lg font-bold tracking-widest text-primary">
                      {joinCode}
                    </code>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(joinCode);
                          toast.success(t('groups.copied'));
                        } catch {
                          toast.error(t('groups.saveFailed'));
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="mt-2"
                    isLoading={joinCodeMutation.isPending}
                    onClick={() => joinCodeMutation.mutate()}
                  >
                    {t('groups.copyCode')}
                  </Button>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-card-border bg-card-bg p-4">
              <p className="mb-2 text-sm font-semibold text-text-primary">
                {t('groups.membersTab')}
              </p>
              <div className="space-y-2">
                {members.slice(0, 5).map((member, index) => (
                  <MemberRow
                    key={member.id}
                    membership={member}
                    rank={index + 1}
                    showKick={false}
                  />
                ))}
              </div>
              {members.length > 5 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 w-full"
                  onClick={() => setTab('members')}
                >
                  {t('groups.membersTab')}
                </Button>
              )}
            </div>
          </section>
        )}

        {tab === 'members' && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-text-primary">
              {t('groups.membersTab')} ({localizeDigits(members.length, language)})
            </h2>
            <div className="space-y-2">
              {members.map((member, index) => (
                <MemberRow
                  key={member.id}
                  membership={member}
                  rank={index + 1}
                  canKick={isAdmin && member.user_id !== user?.id && member.user_id !== group.created_by}
                  showKick={isAdmin}
                  onKick={() =>
                    setConfirm({
                      title: t('groups.kick'),
                      message: t('groups.kickConfirm'),
                      onConfirm: () => kickMutation.mutate(member.user_id),
                    })
                  }
                />
              ))}
              {members.length === 0 && <EmptyState message={t('common.noData')} />}
            </div>

            {isAdmin && (
              <div className="space-y-2 pt-2">
                <h3 className="text-base font-bold text-text-primary">{t('groups.requests')}</h3>
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-text-secondary">{t('groups.noRequests')}</p>
                ) : (
                  pendingRequests.map((request) => (
                    <MemberRow
                      key={request.id}
                      membership={request}
                      isPendingRequest
                      onApprove={() =>
                        reviewMutation.mutate({ memberId: request.user_id, approve: true })
                      }
                      onReject={() =>
                        reviewMutation.mutate({ memberId: request.user_id, approve: false })
                      }
                    />
                  ))
                )}
              </div>
            )}
          </section>
        )}

        {tab === 'chat' && (
          <section>
            <GroupChat groupId={group.id} groupSlug={group.slug ?? group.id} canSend={isMember} isAdmin={isAdmin} />
          </section>
        )}

        {tab === 'battles' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-lg font-bold text-text-primary">
                <Swords className="h-5 w-5" /> {t('groups.battles')}
              </h2>
              {isAdmin && (
                <Button size="sm" onClick={() => setShowBattleForm((value) => !value)}>
                  {t('groups.createBattle')}
                </Button>
              )}
            </div>

            {showBattleForm && isAdmin && (
              <BattleCreateForm
                groupId={group.id}
                onCreated={() => setShowBattleForm(false)}
              />
            )}

            {battles.isLoading ? (
              <Skeleton className="h-24 w-full rounded-2xl" />
            ) : (
              <BattleList
                battles={battles.data?.battles ?? []}
                nowMs={nowMs}
                isAdmin={isAdmin}
                onJoin={(battleId) => battleJoinMutation.mutate(battleId)}
                onOpen={(battleId) =>
                  navigate(`/groups/${group.slug ?? group.id}/battles/${battleId}`)
                }
                onCancel={(battleId) => battleCancelMutation.mutate(battleId)}
                joiningId={battleJoinMutation.isPending ? battleJoinMutation.variables : null}
              />
            )}
          </section>
        )}

        {tab === 'settings' && isOwner && (
          <section className="space-y-4">
            <form
              className="space-y-3 rounded-2xl border border-card-border bg-card-bg p-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (updateMutation.isPending) return;
                updateMutation.mutate();
              }}
            >
              <h2 className="text-lg font-bold text-text-primary">{t('groups.settings')}</h2>

              <label className="block text-sm text-text-secondary">
                {t('groups.name')}
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value.slice(0, 50))}
                  className="mt-1"
                  minLength={2}
                  maxLength={50}
                />
              </label>

              <label className="block text-sm text-text-secondary">
                {t('groups.slug')}
                <Input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().slice(0, 40))}
                  className="mt-1"
                  placeholder={t('groups.slugPlaceholder')}
                  minLength={3}
                  maxLength={40}
                />
                <span className="mt-1 block text-xs">{t('groups.slugHint')}</span>
                <span className="mt-1 block text-xs text-amber-600">
                  {t('groups.settingsSlugWarning')}
                </span>
              </label>

              <label className="block text-sm text-text-secondary">
                {t('groups.icon')}
                <Input
                  value={icon}
                  onChange={(event) => setIcon(event.target.value.slice(0, 8))}
                  className="mt-1"
                  maxLength={8}
                />
              </label>

              <label className="block text-sm text-text-secondary">
                {t('groups.description')}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 300))}
                  rows={3}
                  maxLength={300}
                  className="mt-1 w-full resize-none rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </label>

              <label className="block text-sm text-text-secondary">
                {t('groups.visibility')}
                <select
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as 'public' | 'code' | 'approval')
                  }
                  className="mt-1 w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-text-primary"
                >
                  <option value="public">{t('groups.visibilityPublic')}</option>
                  <option value="code">{t('groups.visibilityCode')}</option>
                  <option value="approval">{t('groups.visibilityApproval')}</option>
                </select>
              </label>

              <label className="block text-sm text-text-secondary">
                {t('groups.maxMembers')}
                <Input
                  type="number"
                  min={Math.max(2, group.member_count)}
                  max={
                    group.group_type === 'community'
                      ? config?.communityMaxMembers ?? 200
                      : config?.squadMaxMembers ?? 50
                  }
                  value={maxMembers}
                  onChange={(event) => setMaxMembers(Number(event.target.value))}
                  className="mt-1"
                />
              </label>

              <Button type="submit" className="w-full" isLoading={updateMutation.isPending}>
                {t('groups.save')}
              </Button>
            </form>

            <div className="space-y-2 rounded-2xl border border-card-border bg-card-bg p-4">
              <Button
                variant="secondary"
                className="w-full"
                isLoading={regenerateMutation.isPending}
                onClick={() =>
                  setConfirm({
                    title: t('groups.regenerateCode'),
                    message: t('groups.joinCode'),
                    onConfirm: () => regenerateMutation.mutate(),
                  })
                }
              >
                <RefreshCw className="mr-1 h-4 w-4" /> {t('groups.regenerateCode')}
              </Button>

              <Button
                variant="danger"
                className="w-full"
                onClick={() =>
                  setConfirm({
                    title: t('groups.disband'),
                    message: t('groups.disbandConfirm'),
                    onConfirm: () => disbandMutation.mutate(),
                  })
                }
              >
                {t('groups.disband')}
              </Button>
            </div>
          </section>
        )}

        <ConfirmModal
          isOpen={Boolean(confirm)}
          title={confirm?.title ?? ''}
          message={confirm?.message ?? ''}
          onConfirm={() => {
            confirm?.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
          isLoading={
            leaveMutation.isPending ||
            disbandMutation.isPending ||
            kickMutation.isPending ||
            regenerateMutation.isPending
          }
        />
      </div>
    </PullToRefresh>
  );
};

export default GroupDetail;
