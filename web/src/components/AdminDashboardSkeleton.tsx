import { Skeleton } from "@/components/ui/skeleton";

export default function AdminDashboardSkeleton() {
  return (
    <div className="h-screen overflow-y-auto" aria-busy="true" aria-label="Loading admin dashboard">
      <div className="mx-auto max-w-[1000px] px-5 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex shrink-0 gap-3">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>

        <div className="mb-10">
          <Skeleton className="mb-4 h-6 w-44" />
          <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--surface-elevated)] p-5">
            <Skeleton className="mb-5 h-4 w-full max-w-xl" />
            <div className="mb-6 flex flex-col gap-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] p-4"
                >
                  <div className="flex flex-wrap gap-4">
                    <Skeleton className="h-16 flex-[1_1_200px] rounded-md" />
                    <Skeleton className="h-16 flex-[2_1_300px] rounded-md" />
                    <Skeleton className="h-16 flex-[1_1_200px] rounded-md" />
                    <Skeleton className="h-6 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="mb-3 h-5 w-36" />
            <div className="flex flex-wrap items-end gap-4">
              <Skeleton className="h-16 flex-[1_1_200px] rounded-md" />
              <Skeleton className="h-16 flex-[2_1_300px] rounded-md" />
              <Skeleton className="h-10 w-32 rounded-md" />
            </div>
          </div>
        </div>

        <div>
          <Skeleton className="mb-4 h-6 w-48" />
          <div className="overflow-hidden rounded-xl border border-[var(--sidebar-border)] bg-[var(--surface-elevated)]">
            <div className="border-b border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] px-6 py-4">
              <div className="flex gap-6">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-4 flex-1 rounded-md" />
                ))}
              </div>
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex gap-6 border-b border-[var(--sidebar-border)] px-6 py-4 last:border-b-0"
              >
                <Skeleton className="h-4 flex-[2] rounded-md" />
                <Skeleton className="h-4 flex-1 rounded-md" />
                <Skeleton className="h-4 flex-1 rounded-md" />
                <Skeleton className="h-4 flex-[1.5] rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
