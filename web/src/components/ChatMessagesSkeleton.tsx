import { Skeleton } from "@/components/ui/skeleton";

export default function ChatMessagesSkeleton() {
  return (
    <div className="chat-messages-skeleton" aria-hidden="true">
      <div className="message message--ai">
        <Skeleton className="avatar ai h-8 w-8 shrink-0 rounded-md" />
        <div className="message-content flex flex-col gap-2.5 pt-0.5">
          <Skeleton className="h-4 w-[92%] rounded-md" />
          <Skeleton className="h-4 w-[78%] rounded-md" />
          <Skeleton className="h-4 w-[64%] rounded-md" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Skeleton className="h-8 w-36 rounded-full" />
            <Skeleton className="h-8 w-44 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
