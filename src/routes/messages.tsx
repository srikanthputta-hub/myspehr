import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, ChevronRight, UserRound, Building2 } from "lucide-react";
import { DetailPageShell, CardShell, sectionColors } from "@/components/spehr-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviders } from "@/features/providers";

export const Route = createFileRoute("/messages")({
  head: () => ({ meta: [{ title: "Messages — My SPEHR Link" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const { providers, loading } = useProviders();

  return (
    <DetailPageShell
      title="Messages"
      subtitle="Care team"
      icon={MessageSquare}
      color={sectionColors.records}
    >
      {loading && providers.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <CardShell icon={MessageSquare} color={sectionColors.records} title="No care team yet">
          <p className="text-sm text-muted-foreground">
            Providers will appear here once you have appointments or prescriptions on file.
          </p>
        </CardShell>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <Link
              key={p.id}
              to="/messages/$providerId"
              params={{ providerId: p.id }}
              className="block rounded-2xl border border-white/[0.06] transition-colors hover:border-white/[0.12]"
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-soft)" }}
            >
              <div className="px-5 py-4 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl shrink-0 grid place-items-center"
                  style={{
                    backgroundColor: `color-mix(in oklab, ${sectionColors.records} 14%, transparent)`,
                  }}
                >
                  {p.isFallback ? (
                    <Building2 className="w-5 h-5" style={{ color: sectionColors.records }} />
                  ) : (
                    <UserRound className="w-5 h-5" style={{ color: sectionColors.records }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground truncate">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.role}
                    {p.organization && !p.isFallback ? ` · ${p.organization}` : ""}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </DetailPageShell>
  );
}
