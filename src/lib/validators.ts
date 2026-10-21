import { z } from "zod";

const trimmed = (max = 200) => z.string().trim().min(1, "Required").max(max);
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(100);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+0-9()\-\s]{7,20}$/, "Enter a valid phone number");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Required") });

export const ownerSignupSchema = z.object({
  name: trimmed(80),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const vehicleSchema = z.object({
  regNo: trimmed(20).transform((v) => v.toUpperCase().replace(/\s+/g, "")),
  make: trimmed(40),
  model: trimmed(40),
  year: z.coerce
    .number()
    .int()
    .min(1950)
    .max(new Date().getFullYear() + 1),
  color: optionalText(30),
  mileage: z.coerce.number().int().min(0).max(2_000_000).optional(),
});

export const createBookingSchema = z.object({
  shopId: z.string().min(1),
  serviceIds: z.array(z.string()).min(1, "Pick at least one service or problem"),
  notes: optionalText(1000),
  date: dateSchema,
  time: hhmm,
  customer: z.object({
    name: trimmed(80),
    email: emailSchema,
    password: z.string().min(1, "Required"),
    phone: phoneSchema.optional(),
  }),
  vehicle: vehicleSchema,
});

const shopFields = {
  name: trimmed(80),
  description: optionalText(500),
  address: trimmed(200),
  city: trimmed(60),
  phone: phoneSchema,
  openTime: hhmm,
  closeTime: hhmm,
  workingDays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day"),
  slotMinutes: z.coerce.number().int().min(15).max(240),
  slotCapacity: z.coerce.number().int().min(1).max(20),
  logoUrl: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
};
const closesAfterOpen = (v: { openTime?: string; closeTime?: string }) =>
  !v.openTime || !v.closeTime || v.openTime < v.closeTime;

export const shopCreateSchema = z.object(shopFields).refine(closesAfterOpen, {
  message: "Closing time must be after opening time",
  path: ["closeTime"],
});
export const shopUpdateSchema = z
  .object(shopFields)
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine(closesAfterOpen, {
    message: "Closing time must be after opening time",
    path: ["closeTime"],
  });

const staffRole = z.enum(["SERVICE_ADVISOR", "TECHNICIAN", "QC_INSPECTOR", "PARTS_PERSON"]);
export const teamCreateSchema = z.object({
  name: trimmed(80),
  email: emailSchema,
  password: passwordSchema.optional(),
  phone: phoneSchema.optional(),
  role: staffRole,
});
export const teamUpdateSchema = z.object({
  role: staffRole.optional(),
  isActive: z.boolean().optional(),
});

export const serviceSchema = z.object({
  name: trimmed(80),
  description: optionalText(300),
  durationMin: z.coerce.number().int().min(15).max(960),
  basePrice: z.coerce.number().int().min(0).max(10_000_000).optional(),
  isActive: z.boolean().optional(),
});

export const inventorySchema = z.object({
  sku: trimmed(40).transform((v) => v.toUpperCase()),
  name: trimmed(100),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000),
  cost: z.coerce.number().int().min(0).max(10_000_000),
});

const poItems = z
  .array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.coerce.number().int().min(1).max(100_000),
      unitCost: z.coerce.number().int().min(0).max(10_000_000),
    }),
  )
  .min(1, "Add at least one item");

export const purchaseOrderSchema = z.object({
  supplier: optionalText(100),
  bookingId: z.string().optional(),
  items: poItems,
});

export const receiveSchema = z.object({
  items: z
    .array(z.object({ poItemId: z.string().min(1), quantity: z.coerce.number().int().min(1) }))
    .min(1, "Enter a received quantity for at least one item"),
});

export const estimateLineSchema = z.object({
  kind: z.enum(["PART", "LABOUR"]),
  description: trimmed(120),
  itemId: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(10_000),
  unitCost: z.coerce.number().int().min(0).max(10_000_000),
});
export type EstimateLineInput = z.infer<typeof estimateLineSchema>;

const lines = z.array(estimateLineSchema).min(1, "Add at least one line");

export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("CONFIRM") }),
  z.object({ action: z.literal("DECLINE"), note: optionalText(300) }),
  z.object({ action: z.literal("ASSIGN_TECHNICIAN"), technicianId: z.string().min(1) }),
  z.object({ action: z.literal("START_INSPECTION") }),
  z.object({
    action: z.literal("SAVE_ESTIMATE"),
    lines: z.array(estimateLineSchema),
    diagnosis: optionalText(1000),
  }),
  z.object({ action: z.literal("SUBMIT_ESTIMATE"), lines, diagnosis: optionalText(1000) }),
  z.object({ action: z.literal("EDIT_ESTIMATE"), lines, diagnosis: optionalText(1000) }),
  z.object({ action: z.literal("SEND_ESTIMATE") }),
  z.object({ action: z.literal("APPROVE_ESTIMATE") }),
  z.object({ action: z.literal("REJECT_ESTIMATE"), note: optionalText(500) }),
  z.object({ action: z.literal("REQUEST_REVISION"), note: optionalText(300) }),
  z.object({ action: z.literal("ASSIGN_PARTS_PERSON"), partsPersonId: z.string().min(1) }),
  z.object({
    action: z.literal("ORDER_PARTS"),
    supplier: optionalText(100),
    items: poItems.optional(),
  }),
  z.object({ action: z.literal("MARK_PARTS_READY") }),
  z.object({ action: z.literal("ALLOCATE_PARTS") }),
  z.object({ action: z.literal("SEND_TO_QC"), note: optionalText(300) }),
  z.object({ action: z.literal("PICK_QC") }),
  z.object({ action: z.literal("QC_PASS"), note: optionalText(500) }),
  z.object({
    action: z.literal("QC_FAIL"),
    title: trimmed(100),
    description: trimmed(1000),
  }),
  z.object({ action: z.literal("NOTIFY_READY") }),
  z.object({ action: z.literal("COMPLETE") }),
  z.object({ action: z.literal("CANCEL"), note: optionalText(300) }),
]);
export type ActionInput = z.infer<typeof actionSchema>;
