"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuthGuard } from "@/components/booking-bits";
import { buttonClass, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/constants";

export default function PosHome() {
  const { me, ready } = useAuthGuard("STAFF");
  const router = useRouter();
  const shops = me?.shops ?? [];
  const isOwner = me?.user?.type === "OWNER";

  // Single-shop staff skip the picker.
  useEffect(() => {
    if (ready && shops.length === 1 && !isOwner) router.replace(`/pos/${shops[0].id}`);
  }, [ready, shops, isOwner, router]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-3xl py-8 sm:py-12">
        <PageHeader
          title="Your shops"
          description="Pick a shop to open its dashboard."
          action={
            isOwner && (
              <Link href="/pos/new" className={buttonClass("primary", "sm")}>
                <Plus className="h-4 w-4" aria-hidden /> New shop
              </Link>
            )
          }
        />
        {!ready ? (
          <Spinner />
        ) : shops.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-8 w-8" aria-hidden />}
            title={isOwner ? "You have not created a shop yet" : "You are not on any shop team yet"}
            description={isOwner ? "Create your first shop, then add your team." : "Ask your shop owner to add you."}
            action={
              isOwner && (
                <Link href="/pos/new" className={buttonClass("primary", "sm")}>
                  Create a shop
                </Link>
              )
            }
          />
        ) : (
          <ul className="space-y-3">
            {shops.map((s) => (
              <li key={`${s.id}-${s.role}`}>
                <Link href={`/pos/${s.id}`} className="block rounded-xl transition-shadow duration-200 hover:shadow-pop">
                  <Card className="flex items-center gap-4 p-5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                      <Building2 className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-ink-soft">
                        {s.city} · {ROLE_LABEL[s.role]}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-ink-soft" aria-hidden />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
