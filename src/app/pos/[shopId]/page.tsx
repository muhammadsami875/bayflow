"use client";

import { BookingBoard } from "@/components/pos/booking-board";
import { OwnerOverview } from "@/components/pos/owner-overview";
import { usePos } from "@/components/pos/pos-context";

/** The landing view differs per role: owners get an overview, everyone else their own work queue. */
export default function PosDashboard() {
  const { role } = usePos();
  return role === "OWNER" ? <OwnerOverview /> : <BookingBoard />;
}
