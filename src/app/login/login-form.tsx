"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Field, InlineError, Input } from "@/components/ui";
import { useMe } from "@/components/providers";
import { api, errorMessage } from "@/lib/api";

/** Demo accounts shown for judges. Display only: nothing here is used by the login logic. */
const DEMO_PASSWORD = "Demo@1234";
const DEMO: { group: string; accounts: [label: string, email: string][] }[] = [
  {
    group: "Lahore Auto Care",
    accounts: [
      ["Owner Sami (2 shops)", "sami@bayflow.test"],
      ["Service Advisor", "bilal.sa@bayflow.test"],
      ["Technician", "imran.tech@bayflow.test"],
      ["QC Inspector", "sara.qc@bayflow.test"],
      ["Parts Person", "usman.parts@bayflow.test"],
    ],
  },
  { group: "Customers", accounts: [["Ahmed (estimate waiting)", "ahmed@mail.com"], ["Sana", "sana@mail.com"]] },
  {
    group: "Other owners (isolation test)",
    accounts: [
      ["Huraira, Islamabad Garage Pro", "huraira@bayflow.test"],
      ["Hassan, Peshawar Quick Fix", "hassan@bayflow.test"],
    ],
  },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useMe();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { user } = await api<{ user: { type: string } }>("/api/auth/login", {
        method: "POST",
        body: { email, password },
      });
      await refresh();
      const next = params.get("next");
      router.push(next && next.startsWith("/") ? next : user.type === "CUSTOMER" ? "/account" : "/pos");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl">Sign in</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Customers, shop staff and owners all sign in here.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <InlineError>{error}</InlineError>
          <Field label="Email" htmlFor="email" required>
            <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-ink-soft hover:text-ink"
              >
                {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </Field>
          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-5 text-sm text-ink-soft">
          Own a shop?{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">
            Create an owner account
          </Link>
          . New customer? Just{" "}
          <Link href="/#shops" className="font-medium text-brand hover:underline">
            book a service
          </Link>
          .
        </p>
      </Card>

      <aside aria-label="Demo accounts">
        <Card className="p-6">
          <h2 className="text-lg">Demo accounts</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Seeded for testing. Every account uses the password{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-ink">{DEMO_PASSWORD}</code>. Click one to fill the form.
          </p>
          <div className="mt-4 space-y-4">
            {DEMO.map((g) => (
              <div key={g.group}>
                <p className="eyebrow mb-2">{g.group}</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {g.accounts.map(([label, mail]) => (
                    <li key={mail}>
                      <button
                        type="button"
                        onClick={() => {
                          setEmail(mail);
                          setPassword(DEMO_PASSWORD);
                          setError("");
                        }}
                        className="w-full rounded-lg border border-line px-3 py-2 text-left transition-colors hover:border-brand hover:bg-brand-soft/40"
                      >
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block truncate font-mono text-xs text-ink-soft">{mail}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </>
  );
}
