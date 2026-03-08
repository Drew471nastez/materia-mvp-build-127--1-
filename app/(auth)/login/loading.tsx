export default function Loading() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f0f0f0",
        zIndex: 9999,
      }}
    >
      <style>{`
        @keyframes auth-spin { to { transform: rotate(360deg); } }
        .auth-spinner {
          width: 36px; height: 36px;
          border: 3px solid rgba(109,40,217,0.2);
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: auth-spin 0.75s linear infinite;
        }
      `}</style>
      <span className="auth-spinner" />
    </div>
  )
}
