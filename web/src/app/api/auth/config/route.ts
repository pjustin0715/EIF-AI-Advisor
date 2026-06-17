import { NextResponse } from "next/server";

export async function GET() {
  const dnaDocId = process.env.DOC_ID_COMPANY_DNA?.replace(/"/g, "") || "";
  return NextResponse.json({
    google_client_id: process.env.GOOGLE_CLIENT_ID || "",
    dev_bypass: process.env.DEV_BYPASS === "true",
    dna_doc_url: dnaDocId
      ? `https://docs.google.com/document/d/${dnaDocId}/view`
      : null,
  });
}
