import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageSquare, Menu } from "lucide-react";
import type { ComponentType } from "react";

type TabPath = "/dashboard" | "/messages" | "/more";

const TABS: ReadonlyArray<{
  to: TabPath;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/messages", label: "Messages", icon: MessageSquare },
  { to: "/more", label: "More", icon: Menu },
];

const HIDDEN_ON: ReadonlyArray<string> = ["/", "/login"];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <nav
      className="sticky bottom-0 inset-x-0 z-40 border-t border-white/[0.06] backdrop-blur-xl mt-auto"
      style={{
        background:
          "linear-gradient(to top, oklch(0.12 0.02 250 / 0.95), oklch(0.14 0.02 250 / 0.85))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="grid grid-cols-3 max-w-sm mx-auto">
        {TABS.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <li key={to}>
              <Link
                to={to}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors"
                style={{
                  color: active
                    ? "var(--brand)"
                    : "color-mix(in oklab, var(--foreground) 55%, transparent)",
                }}
              >
                <Icon className="w-5 h-5" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
