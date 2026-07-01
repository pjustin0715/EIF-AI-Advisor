"use client";
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth-client";

interface Advisor {
  id: string;
  name: string;
  is_active: boolean;
  prompt: string;
  purpose: string;
  rowIndex: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [models, setModels] = useState<{advisor_id: string, model_name: string}[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingModel, setSavingModel] = useState<string | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [savingAdvisor, setSavingAdvisor] = useState(false);

  // New Advisor form state
  const [newAdv, setNewAdv] = useState({ name: "", prompt: "", purpose: "", is_active: true });

  const fetchDashboardData = async (token: string) => {
    try {
      const [statsRes, modelsRes, advisorsRes] = await Promise.all([
        fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/models", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/admin/advisors", { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!statsRes.ok || !modelsRes.ok || !advisorsRes.ok) throw new Error("Unauthorized");

      const statsData = await statsRes.json();
      const modelsData = await modelsRes.json();
      const advisorsData = await advisorsRes.json();

      setStats(statsData.stats);
      setModels(modelsData.models);
      setAdvisors(Array.isArray(advisorsData) ? advisorsData : []);
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ advisor_id, model_name: finalModel })
      });
      
      if (res.ok) {
        setModels(prev => {
          const existing = prev.find(m => m.advisor_id === advisor_id);
          if (existing) return prev.map(m => m.advisor_id === advisor_id ? { ...m, model_name: finalModel } : m);
          return [...prev, { advisor_id, model_name: finalModel }];
        });
      }
    } catch (e) {
      console.error("Failed to update model", e);
    } finally {
      setSavingModel(null);
    }
  };

  const handleClearCache = async () => {
    const token = getAccessToken();
    if (!token) return;
    
    setClearingCache(true);
    try {
      const res = await fetch("/api/admin/cache", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        alert("Cache cleared successfully. AI prompts and DNA docs have been refreshed.");
        fetchDashboardData(token); // Refresh advisors list too
      } else {
        const data = await res.json();
        alert(`Failed to clear cache: ${data.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to clear cache", e);
      alert("An error occurred while clearing the cache.");
    } finally {
      setClearingCache(false);
    }
  };

  const handleAddAdvisor = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAccessToken();
    if (!token) return;

    setSavingAdvisor(true);
    try {
      const res = await fetch("/api/admin/advisors", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newAdv)
      });
      if (res.ok) {
        setNewAdv({ name: "", prompt: "", purpose: "", is_active: true });
        fetchDashboardData(token);
      } else {
        alert("Failed to add advisor");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingAdvisor(false);
    }
  };

  const handleUpdateAdvisor = async (adv: Advisor, field: keyof Advisor, value: any) => {
    const token = getAccessToken();
    if (!token) return;

    const updated = { ...adv, [field]: value };
    
    // Optimistic UI update
    setAdvisors(prev => prev.map(a => a.rowIndex === adv.rowIndex ? updated : a));

    try {
      await fetch("/api/admin/advisors", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.error(err);
      fetchDashboardData(token); // revert on error
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading Admin Dashboard...</div>;
  if (error) return <div style={{ padding: 40, color: "red", textAlign: "center" }}>{error}</div>;

  return (
    <div style={{ height: "100vh", overflowY: "auto" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <div>
            <h1 style={{ margin: 0, color: "#3b0692", fontSize: "2rem" }}>Admin Dashboard</h1>
            <p style={{ margin: "8px 0 0", color: "#758696" }}>Monitor usage and configure AI advisors via Google Sheets.</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button 
              onClick={handleClearCache}
              disabled={clearingCache}
              style={{ padding: "10px 20px", borderRadius: 8, background: "#fff", border: "1px solid #e7eaee", cursor: clearingCache ? "not-allowed" : "pointer", fontWeight: 600, color: "#d93025" }}
            >
              {clearingCache ? "Clearing..." : "Clear Prompt Cache"}
            </button>
            <button 
              onClick={() => window.location.href = "/"}
              style={{ padding: "10px 20px", borderRadius: 8, background: "#f3f5fb", border: "1px solid #e7eaee", cursor: "pointer", fontWeight: 600, color: "#404040" }}
            >
              Return to Chat
            </button>
          </div>
        </div>

        {/* Advisors Management */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ color: "#3b0692", fontSize: "1.5rem", marginBottom: 16 }}>Manage Advisors</h2>
          <div style={{ background: "white", borderRadius: 12, border: "1px solid #e7eaee", padding: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <p style={{ margin: "0 0 20px 0", color: "#758696" }}>
              Advisors are synced directly with your connected Google Sheet. Edits here will write to the sheet.
            </p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              {advisors.map(adv => {
                const dbModel = models.find(m => m.advisor_id === adv.id);
                return (
                  <div key={adv.rowIndex} style={{ background: "#f9f9fb", borderRadius: 8, border: "1px solid #e7eaee", padding: 16 }}>
                    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px" }}>
                        <label style={{ fontSize: "0.8rem", color: "#758696", display: "block", marginBottom: 4 }}>Name</label>
                        <input 
                          type="text" 
                          value={adv.name}
                          onChange={(e) => handleUpdateAdvisor(adv, "name", e.target.value)}
                          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: "100%" }}
                        />
                      </div>
                      <div style={{ flex: "2 1 300px" }}>
                        <label style={{ fontSize: "0.8rem", color: "#758696", display: "block", marginBottom: 4 }}>Google Doc Link (Prompt)</label>
                        <input 
                          type="text" 
                          value={adv.prompt}
                          onChange={(e) => handleUpdateAdvisor(adv, "prompt", e.target.value)}
                          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: "100%" }}
                        />
                      </div>
                      <div style={{ flex: "1 1 200px" }}>
                        <label style={{ fontSize: "0.8rem", color: "#758696", display: "block", marginBottom: 4 }}>Model Selection</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input 
                            type="text" 
                            defaultValue={dbModel?.model_name || "openrouter/auto"}
                            placeholder="openrouter/auto"
                            onBlur={(e) => {
                              if (e.target.value !== dbModel?.model_name) {
                                handleUpdateModel(adv.id, e.target.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const target = e.target as HTMLInputElement;
                                if (target.value !== dbModel?.model_name) {
                                  handleUpdateModel(adv.id, target.value);
                                  target.blur();
                                }
                              }
                            }}
                            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: "100%", fontFamily: "monospace" }}
                          />
                        </div>
                      </div>
                      <div style={{ flex: "0 0 auto", paddingTop: 28 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem" }}>
                          <input 
                            type="checkbox" 
                            checked={adv.is_active}
                            onChange={(e) => handleUpdateAdvisor(adv, "is_active", e.target.checked)}
                          />
                          Active
                        </label>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <h3 style={{ fontSize: "1.1rem", color: "#404040", marginBottom: 12, borderTop: "1px solid #e7eaee", paddingTop: 20 }}>Add New Advisor</h3>
            <form onSubmit={handleAddAdvisor} style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 200px" }}>
                <label style={{ fontSize: "0.8rem", color: "#758696", display: "block", marginBottom: 4 }}>Name</label>
                <input required type="text" value={newAdv.name} onChange={e => setNewAdv({...newAdv, name: e.target.value})} placeholder="e.g. Sales Advisor" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: "100%" }} />
              </div>
              <div style={{ flex: "2 1 300px" }}>
                <label style={{ fontSize: "0.8rem", color: "#758696", display: "block", marginBottom: 4 }}>Google Doc Link</label>
                <input required type="text" value={newAdv.prompt} onChange={e => setNewAdv({...newAdv, prompt: e.target.value})} placeholder="https://docs.google.com/document/d/..." style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e7eaee", width: "100%" }} />
              </div>
              <div style={{ flex: "0 0 auto" }}>
                <button disabled={savingAdvisor} type="submit" style={{ padding: "9px 20px", borderRadius: 6, background: "#3b0692", color: "white", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  {savingAdvisor ? "Adding..." : "Add to Sheets"}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* User Stats */}
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
    </div>
  );
}
