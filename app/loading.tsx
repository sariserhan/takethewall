import { LoadingSkeleton } from "@/components/loading-skeleton";
import { SystemScreen } from "@/components/system-screen";
export default function Loading() {
  return (
    <SystemScreen
      code="…"
      title="MAKING ROOM
FOR THE WALL."
    >
      <LoadingSkeleton />
    </SystemScreen>
  );
}
