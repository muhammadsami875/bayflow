import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="container-page grid gap-8 py-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:py-16">
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}
