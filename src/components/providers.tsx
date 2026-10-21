"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import useSWR from "swr";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { fetcher } from "@/lib/api";
import type { ActorRole } from "@/lib/state-machine";

// ---------------------------------------------------------------- toasts

interface Toast {
  id: number;
  kind: "success" | "error";
  message: string;
}
const ToastContext = createContext<{ push: (kind: Toast["kind"], message: string) => void }>({
  push: () => {},
});
export const useToast = () => useContext(ToastContext);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Toast["kind"], message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-pop"
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
            )}
            <p className="flex-1">{t.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------- session

export interface Me {
  user: { id: string; name: string; email: string; type: "CUSTOMER" | "OWNER" | "STAFF" } | null;
  shops: { id: string; name: string; city: string; isActive: boolean; role: Exclude<ActorRole, "CUSTOMER"> }[];
}

export function useMe() {
  const { data, isLoading, mutate } = useSWR<Me>("/api/auth/me", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 2000,
  });
  return { me: data ?? null, loading: isLoading, refresh: mutate };
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, shouldRetryOnError: false, revalidateOnFocus: false }}>
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}
