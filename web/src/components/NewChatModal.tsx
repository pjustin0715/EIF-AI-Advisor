"use client";

import { useEffect, useState } from "react";

interface AdvisorMap {
  [id: string]: { name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

export default function NewChatModal({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState("");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || "New Chat", advisor_id: advisorId }),
    });
    if (res.ok) {
      const chat = await res.json();
      setTitle("");
      onClose();
      onCreated(chat.id);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h3>Create New Chat</h3>
        <input
          type="text"
          placeholder="Chat Title (e.g. Help with dashboard)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
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
