import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastType = "info" | "success" | "warning" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

const typeStyles: Record<ToastType, string> = {
  info: "border-border bg-card text-foreground",
  success: "border-emerald-500/40 bg-emerald-500 text-white",
  warning: "border-amber-500/40 bg-amber-500 text-black",
  error: "border-destructive/40 bg-destructive text-destructive-foreground",
};

const Toast = ({
  message,
  type = "info",
  duration = 4000,
  onClose,
}: ToastProps) => {
  return (
    <ToastPrimitive.Root
      duration={duration}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      className={cn(
        "group relative grid gap-2 rounded-md border px-4 py-3 text-sm shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
        typeStyles[type]
      )}
    >
      <ToastPrimitive.Description>{message}</ToastPrimitive.Description>
      <ToastPrimitive.Close
        className="absolute right-2 top-2 rounded-md p-1 text-current transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
};

export default Toast;
