import { Skeleton } from "@/components/ui/skeleton";
import ChatMessagesSkeleton from "./ChatMessagesSkeleton";

export default function ChatSkeleton() {
  return (
    <>
      <div className="chat-messages">
        <div className="chat-messages-inner">
          <ChatMessagesSkeleton />
        </div>
      </div>
      <div className="input-container" aria-hidden="true">
        <div className="input-area input-area--skeleton">
          <Skeleton className="h-12 flex-1 rounded-xl" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        </div>
      </div>
    </>
  );
}
