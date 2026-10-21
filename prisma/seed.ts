/**
 * Demo data: 4 shops (2 owners), a full team per shop, service catalogs, inventory,
 * and a few bookings pushed through the real booking engine so every dashboard has work.
 * Slots need no seeding: they are generated from each shop's working hours.
 *
 * Run: npm run db:seed   (wipes existing data first)
 */
import { PrismaClient, type ShopRole } from "@prisma/client";
import { applyDatabaseEnv } from "../src/server/db-url";
import { hashPassword } from "../src/server/password";
import { createBooking } from "../src/server/bookings/create";
import { performAction, type Actor } from "../src/server/bookings/actions";
import { weekdayOf } from "../src/server/slots";

applyDatabaseEnv();
const db = new PrismaClient();
const DEMO_PASSWORD = "Demo@1234";

const TABLES = [
  "Notification", "PurchaseOrderItem", "PurchaseOrder", "Allocation", "QcIssue", "EstimateLine",
  "Estimate", "BookingEvent", "BookingService", "Booking", "Slot", "Vehicle", "InventoryItem",
  "Service", "Membership", "Shop", "User",
];

const SERVICES: [string, string, number, number][] = [
  ["Oil change", "Engine oil and filter replacement", 45, 3500],
  ["Check engine light", "Computer diagnostics and fault code reading", 60, 2000],
  ["Brake failure / brake service", "Inspect pads, discs and brake fluid", 90, 2500],
  ["Tire rotation", "Rotate and balance all four tires", 30, 1500],
  ["AC service", "Gas refill, leak test and cabin filter", 90, 4500],
  ["Battery replacement", "Test and replace the battery", 30, 1000],
  ["Wheel alignment", "Computerised four wheel alignment", 60, 3000],
  ["Suspension noise", "Diagnose knocking or rattling over bumps", 90, 2500],
];

const PARTS: [string, string, number, number, number][] = [
  ["OIL-FLT-01", "Oil filter", 12, 4, 900],
  ["OIL-5W30-4L", "Engine oil 5W-30 (4L)", 8, 3, 5200],
  ["BRK-PAD-F", "Front brake pads (set)", 6, 2, 7800],
  ["IGN-COIL-01", "Ignition coil", 0, 2, 6500],
  ["SPK-PLG-04", "Spark plug", 20, 8, 1200],
  ["AIR-FLT-01", "Air filter", 10, 3, 1500],
  ["WPR-BLD-02", "Wiper blades (pair)", 7, 2, 1800],
  ["BAT-60AH", "Car battery 60Ah", 4, 2, 18500],
];

interface ShopSeed {
  name: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  owner: string;
  team: Record<ShopRole, [name: string, email: string]>;
}

const OWNERS = {
  fatima: { name: "Fatima Raza", email: "fatima@bayflow.test" },
  omar: { name: "Omar Khan", email: "omar@bayflow.test" },
};

// Usman is Parts Person in Lahore and QC Inspector in Karachi: roles are per shop.
const USMAN: [string, string] = ["Usman Tariq", "usman.parts@bayflow.test"];

const SHOPS: ShopSeed[] = [
  {
    name: "Lahore Auto Care",
    city: "Lahore",
    address: "45 Main Boulevard, Gulberg III",
    phone: "+92 42 3578 1100",
    description: "Family-run garage for Japanese and Korean cars. Honest estimates, no surprises.",
    owner: "fatima",
    team: {
      SERVICE_ADVISOR: ["Bilal Ahmed", "bilal.sa@bayflow.test"],
      TECHNICIAN: ["Imran Shah", "imran.tech@bayflow.test"],
      QC_INSPECTOR: ["Sara Malik", "sara.qc@bayflow.test"],
      PARTS_PERSON: USMAN,
    },
  },
  {
    name: "Karachi Motor Works",
    city: "Karachi",
    address: "12 Shahrah-e-Faisal, PECHS",
    phone: "+92 21 3454 2200",
    description: "Full-service workshop with a dedicated quality-control bay.",
    owner: "fatima",
    team: {
      SERVICE_ADVISOR: ["Hina Qureshi", "hina.sa@bayflow.test"],
      TECHNICIAN: ["Faisal Memon", "faisal.tech@bayflow.test"],
      QC_INSPECTOR: USMAN,
      PARTS_PERSON: ["Zain Ali", "zain.parts@bayflow.test"],
    },
  },
  {
    name: "Islamabad Garage Pro",
    city: "Islamabad",
    address: "Plot 8, I-9 Industrial Area",
    phone: "+92 51 4440 3300",
    description: "Specialists in diagnostics, brakes and AC for daily drivers.",
    owner: "fatima",
    team: {
      SERVICE_ADVISOR: ["Ayesha Noor", "ayesha.sa@bayflow.test"],
      TECHNICIAN: ["Kamran Butt", "kamran.tech@bayflow.test"],
      QC_INSPECTOR: ["Rabia Siddiqui", "rabia.qc@bayflow.test"],
      PARTS_PERSON: ["Adeel Mirza", "adeel.parts@bayflow.test"],
    },
  },
  {
    name: "Peshawar Quick Fix",
    city: "Peshawar",
    address: "Ring Road, near University Town",
    phone: "+92 91 5700 4400",
    description: "Fast turnaround servicing. Independent owner, separate team (tenant isolation demo).",
    owner: "omar",
    team: {
      SERVICE_ADVISOR: ["Noman Yousaf", "noman.sa@bayflow.test"],
      TECHNICIAN: ["Salman Gul", "salman.tech@bayflow.test"],
      QC_INSPECTOR: ["Iqra Bibi", "iqra.qc@bayflow.test"],
      PARTS_PERSON: ["Tahir Afridi", "tahir.parts@bayflow.test"],
    },
  },
];

async function wipe() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Next working date (YYYY-MM-DD) at least one day ahead, in the shop's local calendar. */
function nextWorkingDate(workingDays: number[], offsetMinutes: number, skip = 1): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  let n = 0;
  for (let i = 1; i < 30; i++) {
    const cand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i));
    const s = cand.toISOString().slice(0, 10);
    if (workingDays.includes(weekdayOf(s)) && ++n >= skip) return s;
  }
  throw new Error("no working day found");
}

async function main() {
  // `--if-empty` is used by the Vercel build: seed a fresh database once, never touch real data.
  if (process.argv.includes("--if-empty")) {
    if ((await db.user.count()) > 0) {
      console.log("Database already has data. Skipping seed.");
      return;
    }
  } else {
    console.log("Wiping existing data...");
    await wipe();
  }
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owners: Record<string, string> = {};
  for (const [key, o] of Object.entries(OWNERS)) {
    const u = await db.user.create({ data: { ...o, type: "OWNER", passwordHash } });
    owners[key] = u.id;
  }

  const userIds = new Map<string, string>();
  const shops = new Map<string, string>();

  for (const s of SHOPS) {
    const shop = await db.shop.create({
      data: {
        ownerId: owners[s.owner],
        name: s.name,
        city: s.city,
        address: s.address,
        phone: s.phone,
        description: s.description,
        workingDays: [1, 2, 3, 4, 5, 6],
        openTime: "09:00",
        closeTime: "18:00",
        slotMinutes: 60,
        slotCapacity: 2,
      },
    });
    shops.set(s.name, shop.id);

    for (const [role, [name, email]] of Object.entries(s.team) as [ShopRole, [string, string]][]) {
      let id = userIds.get(email);
      if (!id) {
        id = (await db.user.create({ data: { name, email, type: "STAFF", passwordHash } })).id;
        userIds.set(email, id);
      }
      await db.membership.create({ data: { shopId: shop.id, userId: id, role } });
    }

    for (const [name, description, durationMin, basePrice] of SERVICES) {
      await db.service.create({ data: { shopId: shop.id, name, description, durationMin, basePrice } });
    }
    for (const [sku, name, quantity, reorderLevel, cost] of PARTS) {
      await db.inventoryItem.create({ data: { shopId: shop.id, sku, name, quantity, reorderLevel, cost } });
    }
  }

  // ---- Sample bookings, driven through the real engine ----------------------------------------
  const lahore = await db.shop.findFirstOrThrow({ where: { name: "Lahore Auto Care" } });
  const karachi = await db.shop.findFirstOrThrow({ where: { name: "Karachi Motor Works" } });
  const lahoreServices = await db.service.findMany({ where: { shopId: lahore.id } });
  const svc = (name: string) => lahoreServices.find((s) => s.name.startsWith(name))!.id;

  const staff = async (email: string, shopId: string, role: Actor["role"]): Promise<Actor> => {
    const u = await db.user.findUniqueOrThrow({ where: { email } });
    return { userId: u.id, name: u.name, role, shopId };
  };
  const bilal = await staff("bilal.sa@bayflow.test", lahore.id, "SERVICE_ADVISOR");
  const imran = await staff("imran.tech@bayflow.test", lahore.id, "TECHNICIAN");
  const usman = await staff("usman.parts@bayflow.test", lahore.id, "PARTS_PERSON");
  const sara = await staff("sara.qc@bayflow.test", lahore.id, "QC_INSPECTOR");
  const customerActor = (id: string, name: string): Actor => ({ userId: id, name, role: "CUSTOMER" });

  const date1 = nextWorkingDate(lahore.workingDays, lahore.utcOffsetMinutes, 1);
  const date2 = nextWorkingDate(lahore.workingDays, lahore.utcOffsetMinutes, 2);

  // 1) Ahmed: the worked example, parked at AWAITING_CUSTOMER so a judge can approve it.
  const ahmed = await createBooking(
    {
      shopId: lahore.id,
      serviceIds: [svc("Check engine light"), svc("Oil change")],
      notes: "Light came on yesterday, car vibrates at idle.",
      date: date1,
      time: "10:00",
      customer: { name: "Ahmed Khan", email: "ahmed@mail.com", password: DEMO_PASSWORD },
      vehicle: { regNo: "LEA-1234", make: "Honda", model: "Civic", year: 2016, mileage: 84000, color: "White" },
    },
    null,
  );
  const id1 = ahmed.booking.id;
  await performAction(bilal, id1, { action: "CONFIRM" });
  await performAction(bilal, id1, { action: "ASSIGN_TECHNICIAN", technicianId: imran.userId });
  await performAction(imran, id1, { action: "START_INSPECTION" });
  const coil = await db.inventoryItem.findFirstOrThrow({ where: { shopId: lahore.id, sku: "IGN-COIL-01" } });
  const filter = await db.inventoryItem.findFirstOrThrow({ where: { shopId: lahore.id, sku: "OIL-FLT-01" } });
  const oil = await db.inventoryItem.findFirstOrThrow({ where: { shopId: lahore.id, sku: "OIL-5W30-4L" } });
  await performAction(imran, id1, {
    action: "SUBMIT_ESTIMATE",
    diagnosis: "Faulty ignition coil on cylinder 2 causing the misfire and idle vibration.",
    lines: [
      { kind: "PART", description: coil.name, itemId: coil.id, quantity: 1, unitCost: 6500 },
      { kind: "PART", description: filter.name, itemId: filter.id, quantity: 1, unitCost: 900 },
      { kind: "PART", description: oil.name, itemId: oil.id, quantity: 1, unitCost: 5200 },
      { kind: "LABOUR", description: "Labour", quantity: 1, unitCost: 4000 },
    ],
  });
  await performAction(bilal, id1, {
    action: "EDIT_ESTIMATE",
    diagnosis: "Faulty ignition coil on cylinder 2 causing the misfire and idle vibration.",
    lines: [
      { kind: "PART", description: coil.name, itemId: coil.id, quantity: 1, unitCost: 6500 },
      { kind: "PART", description: filter.name, itemId: filter.id, quantity: 1, unitCost: 900 },
      { kind: "PART", description: oil.name, itemId: oil.id, quantity: 1, unitCost: 5200 },
      { kind: "LABOUR", description: "Labour", quantity: 1, unitCost: 3500 },
    ],
  });
  await performAction(bilal, id1, { action: "SEND_ESTIMATE" });

  // 2) Sana: fresh PENDING booking waiting on the Service Advisor.
  await createBooking(
    {
      shopId: lahore.id,
      serviceIds: [svc("Brake")],
      notes: "Brake pedal feels soft and there is a grinding noise.",
      date: date1,
      time: "11:00",
      customer: { name: "Sana Iqbal", email: "sana@mail.com", password: DEMO_PASSWORD },
      vehicle: { regNo: "ABC-789", make: "Suzuki", model: "Alto", year: 2019, color: "Silver" },
    },
    null,
  );

  // 3) Hamza: repaired and waiting in the QC queue (labour-only job, no parts).
  const hamza = await createBooking(
    {
      shopId: lahore.id,
      serviceIds: [svc("Tire rotation")],
      date: date2,
      time: "09:00",
      customer: { name: "Hamza Siddiqui", email: "hamza@mail.com", password: DEMO_PASSWORD },
      vehicle: { regNo: "LHR-2201", make: "Toyota", model: "Corolla", year: 2018 },
    },
    null,
  );
  const id3 = hamza.booking.id;
  const hamzaActor = customerActor(hamza.customerId, "Hamza Siddiqui");
  await performAction(bilal, id3, { action: "CONFIRM" });
  await performAction(bilal, id3, { action: "ASSIGN_TECHNICIAN", technicianId: imran.userId });
  await performAction(imran, id3, { action: "START_INSPECTION" });
  await performAction(imran, id3, {
    action: "SUBMIT_ESTIMATE",
    lines: [{ kind: "LABOUR", description: "Tire rotation and balancing", quantity: 1, unitCost: 1500 }],
  });
  await performAction(bilal, id3, { action: "SEND_ESTIMATE" });
  await performAction(hamzaActor, id3, { action: "APPROVE_ESTIMATE" });
  await performAction(bilal, id3, { action: "ASSIGN_PARTS_PERSON", partsPersonId: usman.userId });
  await performAction(usman, id3, { action: "MARK_PARTS_READY" });
  await performAction(usman, id3, { action: "ALLOCATE_PARTS" });
  await performAction(imran, id3, { action: "SEND_TO_QC", note: "Rotation done, torque checked." });
  void sara;

  // 4) Karachi: one pending booking so that shop's advisor also has work.
  const kSvc = await db.service.findFirstOrThrow({ where: { shopId: karachi.id, name: { startsWith: "AC" } } });
  await createBooking(
    {
      shopId: karachi.id,
      serviceIds: [kSvc.id],
      date: nextWorkingDate(karachi.workingDays, karachi.utcOffsetMinutes, 1),
      time: "14:00",
      customer: { name: "Zara Hussain", email: "zara@mail.com", password: DEMO_PASSWORD },
      vehicle: { regNo: "KHI-5521", make: "Honda", model: "City", year: 2020 },
    },
    null,
  );

  console.log(`Seeded ${SHOPS.length} shops. Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
