/**
 * Lightweight, non-blocking notification (toast) system.
 *
 * Exports:
 *  - `notify`: an imperative API (`notify.success/error/info/dismiss`) that can
 *    be called from anywhere in the app, including non-component code such as
 *    an async recognition loop.
 *  - `Notifications`: a component to mount once; it renders the active toasts.
 *
 * This module is purely presentational — it contains no business logic and
 * makes no network/backend calls.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type NotificationType = "success" | "error" | "info";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  message: string;
}

// Time before a toast auto-dismisses (ms). 0 disables auto-dismiss.
const DEFAULT_DURATION = 4000;

type Listener = (items: NotificationItem[]) => void;

// Module-level store: a single shared queue + its subscribers.
let items: NotificationItem[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  const snapshot = [...items];
  listeners.forEach((listener) => listener(snapshot));
}

function remove(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function push(
  type: NotificationType,
  message: string,
  duration: number = DEFAULT_DURATION
): number {
  const id = nextId++;
  items = [...items, { id, type, message }];
  emit();

  if (duration > 0) {
    setTimeout(() => remove(id), duration);
  }

  return id;
}

/**
 * Imperative notification API. Safe to call from anywhere.
 */
export const notify = {
  success: (message: string, duration?: number) =>
    push("success", message, duration),
  error: (message: string, duration?: number) =>
    push("error", message, duration),
  info: (message: string, duration?: number) =>
    push("info", message, duration),
  dismiss: (id: number) => remove(id),
};

const ICONS: Record<NotificationType, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const ACCENTS: Record<NotificationType, string> = {
  success: "border-green-500/30 text-green-400",
  error: "border-red-500/30 text-red-400",
  info: "border-indigo-500/30 text-indigo-400",
};

/**
 * Renders the active toasts. Mount this once near the app root.
 */
export default function Notifications() {
  const [toasts, setToasts] = useState<NotificationItem[]>(items);

  useEffect(() => {
    const listener: Listener = (next) => setToasts(next);
    listeners.add(listener);
    // Sync immediately in case toasts were added before mount.
    listener([...items]);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)] bg-zinc-900 border ${ACCENTS[toast.type]} rounded-xl px-4 py-3 shadow-xl`}
          >
            <Icon className="w-5 h-5 mt-0.5 shrink-0" />

            <p className="text-sm text-zinc-100 flex-1 break-words">
              {toast.message}
            </p>

            <button
              type="button"
              onClick={() => notify.dismiss(toast.id)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}