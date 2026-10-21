"use client";

import { use, type ReactNode } from "react";
import useSWR from "swr";
import { useAuthGuard } from "@/components/booking-bits";
import { PosProvider, type PosRole, type PosShop } from "@/components/pos/pos-context";
import { PosShell } from "@/components/pos/pos-shell";
import { Card, Spinner } from "@/components/ui";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function PosShopLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ shopId: string }>;
}) {
  const { shopId } = use(params);
  const { ready } = useAuthGuard("STAFF");
  const { data, error, isLoading } = useSWR<{
    shop: PosShop;
    role: PosRole;
    user: { id: string; name: string; email: string };
  }>(ready ? `/api/pos/${shopId}` : null);

  if (!ready || isLoading) {
    return (
      <div className="min-h-dvh bg-bg">
        <Spinner label="Opening your dashboard" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <main id="main" className="container-page py-16">
        <Card className="mx-auto max-w-md p-8 text-center">
          <h1 className="text-xl">You do not have access to this shop</h1>
          <p className="mt-2 text-ink-soft">Ask the shop owner to add you to the team, or switch shop.</p>
          <Link href="/pos" className={buttonClass("primary", "md", "mt-5")}>
            My shops
          </Link>
        </Card>
      </main>
    );
  }

  return (
    <PosProvider value={data}>
      <PosShell>{children}</PosShell>
    </PosProvider>
  );
}
