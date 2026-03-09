export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "#f2f2f2",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
      }}
    >
      <img
        src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/render/image/public/platform%20images/5135%20(1).svg?width=80&quality=80"
        alt="Storelib"
        width={40}
        height={40}
        style={{ display: "block" }}
      />
      <div
        style={{
          width: "24px",
          height: "24px",
          borderRadius: "50%",
          border: "2.5px solid #e0e0e0",
          borderTopColor: "#7c3aed",
          animation: "spin 0.75s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
