export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 animate-pulse">
      <div className="w-14 h-6 bg-gray-200 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-200 rounded-full w-2/3" />
        <div className="h-3 bg-gray-100 rounded-full w-1/3" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-7 rounded-full bg-gray-100" />
        <div className="w-5 h-3 bg-gray-200 rounded-full" />
        <div className="w-7 h-7 rounded-full bg-gray-100" />
      </div>
    </div>
  )
}

export function SkeletonFriendRow() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-gray-200 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded-full w-1/3" />
        <div className="h-3 bg-gray-100 rounded-full w-1/4" />
      </div>
      <div className="w-20 h-7 rounded-lg bg-gray-200 shrink-0" />
    </div>
  )
}

export function SkeletonSwapCard() {
  return (
    <div className="p-4 rounded-xl border border-gray-100 animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-200 rounded-full w-1/3" />
          <div className="h-3 bg-gray-100 rounded-full w-1/2" />
        </div>
        <div className="w-16 h-5 rounded-full bg-gray-200" />
      </div>
      <div className="h-14 bg-gray-100 rounded-xl" />
    </div>
  )
}
