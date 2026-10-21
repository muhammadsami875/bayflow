"use client";

import { use } from "react";
import { BookingDetailView } from "@/components/pos/booking-detail";

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <BookingDetailView bookingId={id} />;
}
