"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { Spinner } from "@/components/Spinner";
import type { ChatPartner } from "@/lib/types";

export function PartnerList({
  partners,
  loading,
  activePartnerId,
  onSelect,
}: {
  partners: ChatPartner[];
  loading: boolean;
  activePartnerId: string | null;
  onSelect: (userId: string) => void;
}) {
  const [search, setSearch] = useState("");

  const visiblePartners = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return partners;
    return partners.filter(
      (partner) =>
        partner.name.toLowerCase().includes(term) ||
        partner.email.toLowerCase().includes(term),
    );
  }, [partners, search]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-3">
        <label htmlFor="user-search" className="sr-only">
          Search people
        </label>
        <input
          id="user-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="px-3 py-6">
            <Spinner label="Loading people…" />
          </div>
        ) : visiblePartners.length === 0 ? (
          <p className="px-3 py-6 text-sm text-slate-500 dark:text-slate-400">
            {partners.length === 0
              ? "No one else has signed up yet. Register a second account in another browser to start chatting."
              : "No one matches that search."}
          </p>
        ) : (
          <ul className="space-y-1">
            {visiblePartners.map((partner) => {
              const isActive = partner.userId === activePartnerId;
              return (
                <li key={partner.userId}>
                  <button
                    type="button"
                    onClick={() => onSelect(partner.userId)}
                    aria-current={isActive ? "true" : undefined}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Avatar name={partner.name} seed={partner.userId} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{partner.name}</span>
                      <span
                        className={`block truncate text-xs ${
                          isActive ? "text-indigo-100" : "text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {partner.email}
                      </span>
                    </span>
                    {partner.unreadCount > 0 && (
                      <span
                        className={`ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                          isActive ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"
                        }`}
                      >
                        <span className="sr-only">Unread messages: </span>
                        {partner.unreadCount > 99 ? "99+" : partner.unreadCount}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
