import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AppLocale } from "@/src/contexts/LocaleContext";
import { recordDate } from "@/src/lib/recordDate";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { formatCommunityCopy, type CommunityCopy } from "./communityCopy";

export type CommunityMember = {
  uid: string;
  displayName: string;
  username: string | null;
  role: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type CommunityDirectory = {
  count: number;
  onlineCount: number | null;
  members: CommunityMember[];
  nextCursor: string | null;
  measuredAt: string;
};

type Props = {
  copy: CommunityCopy;
  directory: CommunityDirectory | null;
  error: string;
  loading: boolean;
  locale: AppLocale;
  onClose: () => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  roomName?: string;
  search: string;
  userId?: string;
};

const localeName = (locale: AppLocale) => locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";

export const CommunityMembersDialog = ({
  copy,
  directory,
  error,
  loading,
  locale,
  onClose,
  onLoadMore,
  onRefresh,
  onSearchChange,
  roomName,
  search,
  userId,
}: Props) => {
  const panel = useRef<HTMLDivElement>(null);
  useDialogFocus(true, panel, onClose);
  const visibleMembers = directory?.members.filter((member) =>
    `${member.displayName} ${member.username || ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ) || [];
  const memberLabel = directory
    ? directory.count === 1 ? copy.oneMember : formatCommunityCopy(copy.membersCount, { count: directory.count })
    : "";
  const onlineLabel = directory?.onlineCount === null
    ? copy.onlineUnavailable
    : formatCommunityCopy(copy.onlineCount, { count: directory?.onlineCount || 0 });

  return createPortal(
    <div className="noviq-modal-backdrop fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="group-members-heading" className="flex max-h-[85dvh] w-full max-w-lg min-w-0 flex-col rounded-2xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-900 dark:text-white" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="group-members-heading" className="text-xl font-bold">{roomName} · {copy.members}</h2>
          <button type="button" aria-label={copy.closeMembers} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{directory ? `${memberLabel} · ${onlineLabel}` : loading ? copy.loadingDirectory : copy.directoryUnavailable}</p>
        <input className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-blue-500/20" aria-label={copy.searchLoadedMembers} placeholder={copy.searchMembersPlaceholder} value={search} onChange={(event) => onSearchChange(event.target.value)} />
        {directory && <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><span>{formatCommunityCopy(copy.updated, { time: recordDate(directory.measuredAt)?.toLocaleTimeString(localeName(locale)) || "" })}</span><button type="button" className="min-h-11 text-blue-700 underline dark:text-blue-300" disabled={loading} onClick={onRefresh}>{copy.refreshMembers}</button></div>}
        {error && <div role="alert" className="my-3 text-sm text-red-600 dark:text-red-300">{error} <button type="button" className="min-h-11 underline" disabled={loading} onClick={onRefresh}>{copy.retry}</button></div>}
        <ul className="my-3 min-h-0 overflow-y-auto" aria-label={copy.groupMembers}>
          {visibleMembers.map((member) => (
            <li key={member.uid} className="flex items-center gap-3 border-b border-slate-100 py-3 dark:border-slate-800">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{member.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{member.displayName}{member.uid === userId ? copy.youSuffix : ""}</p>
                <p className="break-words text-xs text-slate-500 dark:text-slate-400">{member.username ? `@${member.username.replace(/^@/, "")}` : copy.usernameNotSet} · {member.role}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{member.online ? copy.online : member.lastSeenAt && recordDate(member.lastSeenAt) ? formatCommunityCopy(copy.lastActive, { time: recordDate(member.lastSeenAt)?.toLocaleString(localeName(locale)) || "" }) : copy.presenceUnavailable}</p>
              </div>
              {member.online && <span aria-label={copy.online} className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
            </li>
          ))}
        </ul>
        {directory?.nextCursor && <button type="button" className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={loading} onClick={onLoadMore}>{copy.loadMoreMembers}</button>}
        {loading && <p role="status" className="mt-2 text-sm">{copy.loadingMembers}</p>}
        {directory && !directory.members.length && !loading && <p>{copy.noMembers}</p>}
        {directory && directory.members.length > 0 && !visibleMembers.length && <p>{copy.noMemberMatches}</p>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{copy.onlineHelp}</p>
      </div>
    </div>,
    document.body,
  );
};
