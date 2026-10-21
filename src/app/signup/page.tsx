"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Field, InlineError, Input } from "@/components/ui";
import { SiteHeader } from "@/components/site-header";
import { useMe } from "@/components/providers";
import { api, ApiClientError, errorMessage } from "@/lib/api";

export default function OwnerSignupPage() {
  const router = useRouter();
  const { refresh } = useMe();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: { ...form, phone: form.phone || undefined },
      });
      await refresh();
      router.push("/pos/new");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) {
        setErrors(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v?.[0] ?? ""])));
      }
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page py-10 lg:py-16">
        <Card className="mx-auto max-w-md p-6 sm:p-8">
          <h1 className="text-2xl">Create your owner account</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Next you will set up your first shop and add your team. Staff accounts are created by you, never by
            self sign-up.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <InlineError>{error}</InlineError>
            <Field label="Full name" htmlFor="name" required error={errors.name}>
              <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} invalid={!!errors.name} required />
            </Field>
            <Field label="Email" htmlFor="email" required error={errors.email}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} invalid={!!errors.email} required />
            </Field>
            <Field label="Phone" htmlFor="phone" hint="Optional" error={errors.phone}>
              <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} invalid={!!errors.phone} />
            </Field>
            <Field label="Password" htmlFor="password" required hint="At least 8 characters" error={errors.password}>
              <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} invalid={!!errors.password} required />
            </Field>
            <Button type="submit" loading={busy} className="w-full">
              Create account
            </Button>
          </form>
          <p className="mt-5 text-sm text-ink-soft">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </main>
    </>
  );
}
