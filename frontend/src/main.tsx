import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { FeedbackProvider } from "@/components/ui/FeedbackProvider";
import { registerSW } from "virtual:pwa-register";
import "@/i18n";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// The service worker serves the cached build first and fetches a new deploy in the
// background. With autoUpdate, registering through the plugin reloads the page
// once that new build takes over, so a deploy shows on this visit rather than
// some later one. (Pages that hold unsaved work save on pagehide.)
registerSW({ immediate: true });

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </QueryClientProvider>
  </StrictMode>
);
