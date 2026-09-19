import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/bottom-nav";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MySpehr" },
      { name: "description", content: "My SPEHR Link is a patient portal app for accessing health records and managing appointments." },
      { name: "author", content: "S Group" },
      { property: "og:title", content: "MySpehr" },
      { property: "og:description", content: "My SPEHR Link is a patient portal app for accessing health records and managing appointments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "MySpehr" },
      { name: "twitter:description", content: "My SPEHR Link is a patient portal app for accessing health records and managing appointments." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Auto-seed the fabricated test patient so the dashboards stay open
  // without going through login while the FHIR layer is rebuilt.
  useEffect(() => {
    void (async () => {
      const { patientStore } = await import("@/lib/patient-store");
      const { TEST_PATIENT } = await import("@/lib/test-data");
      if (!patientStore.get()) patientStore.set(TEST_PATIENT);
    })();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen w-full flex items-center justify-center overflow-hidden bg-slate-950">
        <div className="relative w-full max-w-md flex flex-col overflow-hidden bg-background shadow-2xl h-full sm:h-[85vh] sm:rounded-[2.5rem]">
          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
          <BottomNav />
        </div>
      </div>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
