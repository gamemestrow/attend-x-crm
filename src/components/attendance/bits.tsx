import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "destructive" | "primary";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "tabular mt-1 font-display text-3xl font-bold",
              tone === "success" && "text-success",
              tone === "destructive" && "text-destructive",
              tone === "primary" && "text-primary",
            )}
          >
            {value}
          </div>
          {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {icon && (
          <div className="rounded-lg bg-accent p-2 text-accent-foreground">{icon}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: "PRESENT" | "ABSENT" | "PENDING" }) {
  if (status === "PRESENT") return <Badge variant="success">PRESENT</Badge>;
  if (status === "ABSENT") return <Badge variant="destructive">ABSENT</Badge>;
  return <Badge variant="warning">PENDING</Badge>;
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
