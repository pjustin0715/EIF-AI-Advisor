import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getCurrentUser } from "@/lib/auth";
import { getRagServiceUrl, ragServiceHeaders } from "@/lib/rag-config";

// Ensure we don't cache this route
export const dynamic = 'force-dynamic';

async function getSheetsClient() {
  const saJsonStr = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJsonStr) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  
  const credentials = JSON.parse(saJsonStr);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

function extractDocId(urlOrId: string) {
  if (!urlOrId) return "";
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return urlOrId.trim();
}

function getAdvisorsFromEnv() {
  const legacyNames: Record<string, string> = {
    advisor1: "Data Dashboard Advisor",
    advisor2: "SSOT Memo Advisor",
    advisor3: "Data Modeling Advisor",
  };
  const legacyDocs: Record<string, string | undefined> = {
    advisor1: process.env.DOC_ID_ADVISOR1,
    advisor2: process.env.DOC_ID_ADVISOR2,
    advisor3: process.env.DOC_ID_ADVISOR3,
  };

  return Object.entries(legacyDocs)
    .filter(([, docId]) => docId)
    .map(([id, docId], index) => ({
      id,
      name: legacyNames[id] ?? id,
      is_active: true,
      prompt: `https://docs.google.com/document/d/${docId}`,
      purpose: "",
      doc_id: docId!,
      rowIndex: index + 2,
    }));
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(getAdvisorsFromEnv());
  }

  try {
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "A:D",
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      return NextResponse.json(getAdvisorsFromEnv());
    }

    // Skip header
    const advisors = rows.slice(1).map((row, index) => {
      const name = row[0] || "";
      const isActiveStr = (row[1] || "").toLowerCase();
      const promptLink = row[2] || "";
      const purpose = row[3] || "";
      const docId = extractDocId(promptLink);

      return {
        id: `advisor${index + 1}`,
        name,
        is_active: isActiveStr === "true",
        prompt: promptLink,
        purpose,
        doc_id: docId,
        rowIndex: index + 2, // 1-indexed, +1 for header
      };
    }).filter(a => a.doc_id); // Filter out empty rows

    return NextResponse.json(advisors.length > 0 ? advisors : getAdvisorsFromEnv());
  } catch (error: any) {
    console.error("Sheets GET Error:", error);
    return NextResponse.json(getAdvisorsFromEnv());
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Add a new advisor
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "Missing SPREADSHEET_ID" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { name, is_active, prompt, purpose } = body;

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, is_active ? "TRUE" : "FALSE", prompt, purpose]],
      },
    });

    // Also call the RAG service /reindex to invalidate backend cache immediately
    fetch(`${getRagServiceUrl()}/reindex?force=true`, {
      method: "POST",
      headers: ragServiceHeaders(),
    }).catch(e => console.error("Failed to trigger reindex:", e));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sheets POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Update an existing advisor
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json({ error: "Missing SPREADSHEET_ID" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { rowIndex, name, is_active, prompt, purpose } = body;
    if (!rowIndex) throw new Error("Missing rowIndex");

    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `A${rowIndex}:D${rowIndex}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, is_active ? "TRUE" : "FALSE", prompt, purpose]],
      },
    });

    fetch(`${getRagServiceUrl()}/reindex?force=true`, {
      method: "POST",
      headers: ragServiceHeaders(),
    }).catch(e => console.error("Failed to trigger reindex:", e));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Sheets PUT Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
