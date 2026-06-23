"use client";
import { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("eif_advisor_token");
    if (!token) {
      window.location.href = "/";
      return;
    }

    fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then(data => {
        setStats(data.stats);
        setLoading(false);
      })
      .catch(() => {
        setError("You do not have permission to view this page. Please log in with an Admin account.");
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading Admin Dashboard...</div>;
  if (error) return <div style={{ padding: 40, color: "red", textAlign: "center" }}>{error}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <div>
          <h1 style={{ margin: 0, color: "#3b0692", fontSize: "2rem" }}>Admin Dashboard</h1>
          <p style={{ margin: "8px 0 0", color: "#758696" }}>Monitor AI model usage and costs across your team.</p>
        </div>
        <button 
          onClick={() => window.location.href = "/"}
          style={{ padding: "10px 20px", borderRadius: 8, background: "#f3f5fb", border: "1px solid #e7eaee", cursor: "pointer", fontWeight: 600, color: "#404040" }}
        >
          Return to Chat
        </button>
      </div>

      <div style={{ background: "white", borderRadius: 12, border: "1px solid #e7eaee", overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead style={{ background: "#f9f9fb", borderBottom: "1px solid #e7eaee" }}>
            <tr>
              <th style={{ padding: "16px 24px", fontWeight: 600, color: "#404040" }}>User Email</th>
              <th style={{ padding: "16px 24px", fontWeight: 600, color: "#404040" }}>Total Tokens</th>
              <th style={{ padding: "16px 24px", fontWeight: 600, color: "#404040" }}>Est. Cost (USD)</th>
              <th style={{ padding: "16px 24px", fontWeight: 600, color: "#404040" }}>Models Used</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(user => (
              <tr key={user.email} style={{ borderBottom: "1px solid #e7eaee" }}>
                <td style={{ padding: "16px 24px", color: "#222" }}>{user.email}</td>
                <td style={{ padding: "16px 24px", color: "#758696" }}>{user.totalTokens.toLocaleString()}</td>
                <td style={{ padding: "16px 24px", color: "#00b0a4", fontWeight: 600 }}>${user.totalCost.toFixed(4)}</td>
                <td style={{ padding: "16px 24px" }}>
                  {user.models.map((m: string) => (
                    <span key={m} style={{ display: "inline-block", padding: "4px 10px", background: "#f3f5fb", border: "1px solid #e7eaee", borderRadius: 6, fontSize: "0.8rem", marginRight: 8, color: "#404040" }}>
                      {m}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#758696" }}>No usage data available yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
