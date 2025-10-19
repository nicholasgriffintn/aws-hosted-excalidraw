import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";

import Toast, { ToastType } from "../components/Toast";

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastContext.Provider value={{ showToast }}>
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
        <ToastPrimitive.Viewport className="fixed top-4 right-4 z-[1100] flex w-full max-w-sm flex-col gap-3 outline-none" />
      </ToastContext.Provider>
    </ToastPrimitive.Provider>
  );
};

export default ToastProvider;
