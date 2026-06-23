"use client";
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth-client";

const ADVISOR_NAMES: Record<string, string> = {
  advisor1: "Data Dashboard Advisor",
  advisor2: "SSOT Memo Advisor",
  advisor3: "Data Modeling Advisor",
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [models, setModels] = useState<{advisor_id: string, model_name: string}[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModel, setSavingModel] = useState<string | null>(null);

  const fetchDashboardData = async (token: string) => {
    try {
      const [statsRes, modelsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/models", { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!statsRes.ok || !modelsRes.ok) throw new Error("Unauthorized");

      const statsData = await statsRes.json();
      const modelsData = await modelsRes.json();

      setStats(statsData.stats);
      setModels(modelsData.models);
      setLoading(false);
    } catch {
      setError("You do not have permission to view this page. Please log in with an Admin account.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      window.location.href = "/";
      return;
    }
    fetchDashboardData(token);
  }, []);

  const handleUpdateModel = async (advisor_id: string, model_name: string) => {
    const token = getAccessToken();
    if (!token) return;
    
    const finalModel = model_name.trim() || "openrouter/auto";

    setSavingModel(advisor_id);
    try {
      const res = await fetch("/api/admin/models", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ advisor_id, model_name: finalModel })
      });
      
      if (res.ok) {
        // Update local state
        setModels(prev => {
          const existing = prev.find(m => m.advisor_id === advisor_id);
          if (existing) {
            return prev.map(m => m.advisor_id === advisor_id ? { ...m, model_name: finalModel } : m);
          } else {
            return [...prev, { advisor_id, model_name: finalModel }];
          }
        });
      }
    } catch (e) {
      console.error("Failed to update model", e);
    } finally {
      setSavingModel(null);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading Admin Dashboard...</div>;
  if (error) return <div style={{ padding: 40, color: "red", textAlign: "center" }}>{error}</div>;

  // Prepare advisors to display
  const displayAdvisors = ["advisor1", "advisor2", "advisor3"].map(id => {
    const dbModel = models.find(m => m.advisor_id === id);
    return {
      id,
      name: ADVISOR_NAMES[id] || id,
      model_name: dbModel?.model_name || "openrouter/auto"
    };
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
        <div>
          <h1 style={{ margin: 0, color: "#3b0692", fontSize: "2rem" }}>Admin Dashboard</h1>
          <p style={{ margin: "8px 0 0", color: "#758696" }}>Monitor AI model usage and configure advisor settings.</p>
        </div>
        <button 
          onClick={() => window.location.href = "/"}
          style={{ padding: "10px 20px", borderRadius: 8, background: "#f3f5fb", border: "1px solid #e7eaee", cursor: "pointer", fontWeight: 600, color: "#404040" }}
        >
          Return to Chat
        </button>
      </div>

      <div style={{ marginBottom: 40 }}>
        <h2 style={{ color: "#3b0692", fontSize: "1.5rem", marginBottom: 16 }}>Model Management</h2>
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #e7eaee", padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <p style={{ margin: "0 0 20px 0", color: "#758696" }}>
            Set the OpenRouter model string for each advisor (e.g. <code>google/gemini-2.5-flash-lite</code>, <code>meta-llama/llama-3-8b-instruct</code>, or <code>openrouter/auto</code>).
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {displayAdvisors.map(adv => (
              <div key={adv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#f9f9fb", borderRadius: 8, border: "1px solid #e7eaee" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#404040" }}>{adv.name}</div>
                  <div style={{ fontSize: "0.85rem", color: "#758696" }}>ID: {adv.id}</div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input 
                    key={adv.model_name}
                    type="text" 
                    defaultValue={adv.model_name}
                    placeholder="openrouter/auto"
                    onBlur={(e) => {
                      if (e.target.value !== adv.model_name) {
                        handleUpdateModel(adv.id, e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const target = e.target as HTMLInputElement;
                        if (target.value !== adv.model_name) {
                          handleUpdateModel(adv.id, target.value);
                          target.blur();
                        }
                      }
                    }}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: 300, fontFamily: "monospace" }}
                  />
                  <div style={{ width: 80, fontSize: "0.85rem", color: "#758696", textAlign: "right" }}>
                    {savingModel === adv.id ? "Saving..." : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ color: "#3b0692", fontSize: "1.5rem", marginBottom: 16 }}>User Usage & Costs</h2>
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
    </div>
  );
}
