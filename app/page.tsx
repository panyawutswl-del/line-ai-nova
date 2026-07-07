export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
      }}
    >
      <h1>✨ Nova</h1>
      <p>Personal AI Assistant on LINE — service is running.</p>
      <p style={{ color: "#888", fontSize: "0.85rem" }}>
        Webhook: <code>/api/webhook/line</code>
      </p>
    </main>
  );
}
