import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  count?: number;
}

export default function SidebarChatSkeleton({ count = 4 }: Props) {
  return (
    <div className="chat-list-skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`chat-item chat-item--skeleton ${i === 0 ? "active" : ""}`}
        >
          <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 flex-1 rounded-md" style={{ maxWidth: i % 2 === 0 ? "75%" : "55%" }} />
        </div>
      ))}
    </div>
  );
}
