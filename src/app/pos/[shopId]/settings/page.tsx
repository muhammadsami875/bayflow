"use client";

import { use } from "react";
import { mutate as globalMutate } from "swr";
import { usePos } from "@/components/pos/pos-context";
import { ShopForm, toPayload, type ShopFormValues } from "@/components/pos/shop-form";
import { useToast } from "@/components/providers";
import { Card, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

export default function SettingsPage({ params }: { params: Promise<{ shopId: string }> }) {
  use(params);
  const { shop } = usePos();
  const toast = useToast();

  const initial: ShopFormValues = {
    name: shop.name,
    description: shop.description ?? "",
    address: shop.address,
    city: shop.city,
    phone: shop.phone,
    openTime: shop.openTime,
    closeTime: shop.closeTime,
    workingDays: shop.workingDays,
    slotMinutes: shop.slotMinutes,
    slotCapacity: shop.slotCapacity,
    logoUrl: shop.logoUrl ?? "",
  };

  return (
    <div>
      <PageHeader title="Shop settings" description="Working hours and slot capacity control which times customers can book." />
      <Card className="p-5 sm:p-7">
        <ShopForm
          initial={initial}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await api(`/api/pos/${shop.id}`, { method: "PATCH", body: toPayload(v) });
            await globalMutate(`/api/pos/${shop.id}`);
            await globalMutate("/api/auth/me");
            toast.push("success", "Shop settings saved.");
          }}
        />
      </Card>
    </div>
  );
}
