export function Rows({ label, n = 8 }: { label: string; n?: number }) {
  return (
    <div className="space-y-3" data-fix-rows={label}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-2xl border border-[#e4e7ec]/80 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[14px] font-semibold text-[#1a1a2e]">{label} {i + 1}</p>
          <p className="mt-1 text-[13px] text-[#6b7280]">Something that happened in Clay Studio, a little while ago.</p>
        </div>
      ))}
    </div>
  )
}
