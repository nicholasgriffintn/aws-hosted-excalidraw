import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from "@tanstack/react-query";

import App from './App';
import "./styles/globals.css";
import ToastProvider, { useToast } from './contexts/ToastProvider';
import { initializeLogger } from './utils/logger';
import { queryClient } from "./lib/query-client";

const AppWithToasts = () => {
  const { showToast } = useToast();

  React.useEffect(() => {
    initializeLogger(showToast);
  }, [showToast]);

  return <App />;
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppWithToasts />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
