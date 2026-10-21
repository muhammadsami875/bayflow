"use client";

import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { useAuthGuard } from "@/components/booking-bits";
import { useMe } from "@/components/providers";
import { createShopRequest, EMPTY_SHOP, ShopForm } from "@/components/pos/shop-form";
import { Card, PageHeader, Spinner } from "@/components/ui";

export default function NewShopPage() {
  const { ready } = useAuthGuard("STAFF");
  const { refresh } = useMe();
  const router = useRouter();

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page max-w-3xl py-8 sm:py-12">
        <PageHeader title="Create a shop" description="Each shop has its own team, services, slots and inventory." />
        {!ready ? (
          <Spinner />
        ) : (
          <Card className="p-5 sm:p-7">
            <ShopForm
              initial={EMPTY_SHOP}
              submitLabel="Create shop"
              onSubmit={async (v) => {
                const { shop } = await createShopRequest(v);
                await refresh();
                router.push(`/pos/${shop.id}/team`);
              }}
            />
          </Card>
        )}
      </main>
    </>
  );
}
