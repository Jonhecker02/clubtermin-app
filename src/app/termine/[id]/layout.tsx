import { RestoreGate } from "@/components/RestoreGate";
import { SkeletonDetail } from "@/components/ui/Skeleton";

export default function TerminDetailLayout({ children }: { children: React.ReactNode }) {
  return <RestoreGate fallback={<SkeletonDetail />}>{children}</RestoreGate>;
}
