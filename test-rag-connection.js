#!/usr/bin/env node

const RAG_SERVICE_URL =
  process.env.RAG_SERVICE_URL || "http://localhost:8001";
const RAG_SERVICE_SECRET = process.env.RAG_SERVICE_SECRET || "";

async function testRagConnection() {
  console.log("🧪 Testing RAG Service Connection");
  console.log("================================");
  console.log(`RAG Service URL: ${RAG_SERVICE_URL}`);
  console.log(`Using secret: ${RAG_SERVICE_SECRET ? "Yes" : "No"}\n`);

  // Test 1: Health Check
  console.log("1️⃣  Health Check...");
  try {
    const healthRes = await fetch(`${RAG_SERVICE_URL}/health`);
    if (healthRes.ok) {
      const data = await healthRes.json();
      console.log("✅ Health check passed:", data);
    } else {
      console.log(
        `❌ Health check failed: ${healthRes.status} ${healthRes.statusText}`
      );
    }
  } catch (err) {
    console.log(
      `❌ Health check error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Test 2: Retrieve with valid advisor
  console.log("\n2️⃣  Testing /retrieve endpoint with advisor1...");
  try {
    const retrieveRes = await fetch(
      `${RAG_SERVICE_URL}/retrieve?advisor_id=advisor1`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(RAG_SERVICE_SECRET ? { "X-RAG-Secret": RAG_SERVICE_SECRET } : {}),
        },
        body: JSON.stringify({ query: "What is the company culture?" }),
      }
    );

    if (retrieveRes.ok) {
      const data = await retrieveRes.json();
      console.log("✅ Retrieve endpoint works!");
      console.log(`   - Retrieved ${data.chunks?.length || 0} chunks`);
      console.log(
        `   - Low grounding: ${data.low_grounding ? "Yes" : "No"}`
      );
      console.log(`   - Doc URL: ${data.doc_url || "Not set"}`);
      console.log(`   - Citations: ${data.citations?.length || 0}`);
      if (data.chunks?.length > 0) {
        console.log(`   - First chunk heading: "${data.chunks[0].heading}"`);
      }
    } else {
      const text = await retrieveRes.text();
      console.log(
        `❌ Retrieve failed: ${retrieveRes.status} ${retrieveRes.statusText}`
      );
      console.log(`   Response: ${text}`);
    }
  } catch (err) {
    console.log(
      `❌ Retrieve error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Test 3: Get Prompts
  console.log("\n3️⃣  Testing /prompts endpoint...");
  try {
    const promptsRes = await fetch(
      `${RAG_SERVICE_URL}/prompts/advisor1`,
      {
        method: "GET",
        headers: {
          ...(RAG_SERVICE_SECRET ? { "X-RAG-Secret": RAG_SERVICE_SECRET } : {}),
        },
      }
    );

    if (promptsRes.ok) {
      const data = await promptsRes.json();
      console.log("✅ Prompts endpoint works!");
      console.log(`   - Advisor: ${data.name}`);
      console.log(`   - Prompt length: ${data.prompt?.length || 0} chars`);
    } else {
      const text = await promptsRes.text();
      console.log(
        `❌ Prompts failed: ${promptsRes.status} ${promptsRes.statusText}`
      );
      console.log(`   Response: ${text}`);
    }
  } catch (err) {
    console.log(
      `❌ Prompts error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Test 4: Authentication (invalid secret)
  if (RAG_SERVICE_SECRET) {
    console.log("\n4️⃣  Testing authentication (invalid secret)...");
    try {
      const authRes = await fetch(
        `${RAG_SERVICE_URL}/retrieve?advisor_id=advisor1`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-RAG-Secret": "invalid-secret",
          },
          body: JSON.stringify({ query: "test" }),
        }
      );

      if (authRes.status === 401) {
        console.log("✅ Auth check works (invalid secret correctly rejected)");
      } else {
        console.log(
          `⚠️  Unexpected status: ${authRes.status} (expected 401)`
        );
      }
    } catch (err) {
      console.log(
        `❌ Auth test error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log("\n================================");
  console.log("✨ Test complete!");
}

testRagConnection().catch(console.error);
