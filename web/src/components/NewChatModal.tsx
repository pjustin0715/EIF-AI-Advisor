"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth-client";

interface AdvisorMap {
  [id: string]: { name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (chatId: string, advisorId: string) => void;
}

export default function NewChatModal({ open, onClose, onCreated }: Props) {
  const [advisorId, setAdvisorId] = useState("");
  const [advisors, setAdvisors] = useState<AdvisorMap>({});

  useEffect(() => {
    if (!open) return;
    fetch("/api/advisors")
      .then((r) => r.json())
      .then((data: AdvisorMap) => {
        setAdvisors(data);
        const first = Object.keys(data)[0];
        if (first) setAdvisorId(first);
      })
      .catch(() => setAdvisors({ advisor1: { name: "General" } }));
  }, [open]);

  if (!open) return null;

  async function handleSubmit() {
    if (!advisorId) return;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title: "New Chat", advisor_id: advisorId }),
    });
    if (res.ok) {
      const chat = await res.json();
      onClose();
      onCreated(chat.id, chat.advisor_id);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Create New Chat</h3>
        <p className="modal-hint">Title is generated automatically from your first message.</p>
        <select value={advisorId} onChange={(e) => setAdvisorId(e.target.value)}>
          {Object.entries(advisors).map(([id, adv]) => (
            <option key={id} value={id}>
              {adv.name}
            </option>
          ))}
        </select>
        <div className="btn-row">
          <button className="cancel" onClick={onClose} type="button">
            Cancel
          </button>
          <button onClick={handleSubmit} type="button">
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
