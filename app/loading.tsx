import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SystemScreen } from "@/components/system-screen";
export default function Loading() {
  return (
    <SystemScreen code="ONE WALL. ONE OWNER." title="GETTING THE WALL READY.">
      <LoadingSkeleton />
    </SystemScreen>
  );
}
