import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/types";

const CONFIG: Record<Status, { label: string; variant: "success" | "warning" | "destructive"; icon: typeof CheckCircle2 }> = {
  optimal: { label: "Óptimo", variant: "success", icon: CheckCircle2 },
  warning: { label: "A mejorar", variant: "warning", icon: AlertTriangle },
  critical: { label: "Crítico", variant: "destructive", icon: XCircle },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, variant, icon: Icon } = CONFIG[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}
