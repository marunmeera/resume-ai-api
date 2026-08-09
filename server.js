import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();

app.use(cors());
app.use(express.json());

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const PRICES = { pdf: 1900, word: 2900 }; // amount in paise — decided server-side, never trust client

// ---------------------------------------------------------
// 1. Create a Razorpay order (amount fixed server-side)
// ---------------------------------------------------------
app.post("/create-order", async (req, res) => {
  try {
    const { type } = req.body;
    const amount = PRICES[type];
    if (!amount) return res.json({ success: false, error: "invalid_type" });

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency: "INR",
        receipt: `receipt_${Date.now()}`
      })
    });

    const order = await orderRes.json();
    if (!order.id) {
      console.error("ORDER CREATE FAILED:", order);
      return res.json({ success: false });
    }

    res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      key_id: RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error("ORDER ERROR:", error);
    res.json({ success: false });
  }
});

// ---------------------------------------------------------
// 2. Generate resume — only after verifying payment signature
// ---------------------------------------------------------
app.post("/generate", async (req, res) => {
  try {
    const data = req.body;
    const payment = data.payment;

    if (!payment || !payment.razorpay_order_id || !payment.razorpay_payment_id || !payment.razorpay_signature) {
      return res.json({ success: false, error: "payment_invalid" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== payment.razorpay_signature) {
      console.warn("SIGNATURE MISMATCH — rejecting generation request");
      return res.json({ success: false, error: "payment_invalid" });
    }

    // ----- Payment verified. Proceed to AI generation. -----

    const academics = (data.academics || []).map(a => ({
      qualification: a[0] || "",
      institution: a[1] || "",
      grade: a[2] || ""
    })).filter(a => a.qualification || a.institution);

    const experience = (data.experience || []).filter(e => e.company || e.role);
    const skills = (data.skills || []).filter(Boolean);

    const prompt = `You are a senior resume writer who has reviewed thousands of resumes for recruiters and hiring managers. Rewrite this candidate's raw input into polished, ATS-friendly resume content.

STRICT RULES:
- Use ONLY the facts given. Never invent employers, dates, qualifications, or numbers that aren't implied by the input.
- If the input is genuinely thin for a section, write less rather than pad with generic filler.
- Never use these clichés: "hardworking", "team player", "detail-oriented", "responsible for", "duties included", "passionate about".
- Every experience bullet must start with a strong action verb (Led, Built, Reduced, Automated, Increased, Coordinated, etc.) and describe an outcome, not a task.
- Quantify wherever the input reasonably allows (%, ₹, hours saved, team size, number of items/customers/campaigns) — but only when justified by what the candidate actually wrote. Do not fabricate numbers.
- Vary sentence structure — never start two bullets in the same section with the same verb.
- Write a 2-3 sentence professional summary that reflects the candidate's actual background, not a generic template line.

CANDIDATE DATA:
Name: ${data.name}
Email: ${data.email}
Mobile: ${data.mobile}

Education: ${JSON.stringify(academics)}
Experience (raw notes to rewrite): ${JSON.stringify(experience)}
Skills: ${JSON.stringify(skills)}
Projects (raw notes to rewrite): ${data.projects || ""}

Return ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "headline": "short professional title line based on their background",
  "summary": "2-3 sentence professional summary",
  "education": [{"qualification":"","institution":"","grade":""}],
  "experience": [{"company":"","role":"","duration":"","bullets":["...","..."]}],
  "skills": ["..."],
  "projects": [{"title":"","description":""}]
}
Omit an array entirely only if there was truly no usable input for it.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const result = await response.json();
    let raw = (result.content || []).map(b => b.text || "").join("").trim();
    raw = raw.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();

    let content;
    try {
      content = JSON.parse(raw);
    } catch (e) {
      console.error("PARSE ERROR:", raw);
      return res.json({ success: false });
    }

    if (!content || !content.summary) {
      return res.json({ success: false });
    }

    const esc = (s) => String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const educationHtml = (content.education || []).map(e => `
      <p><b>${esc(e.qualification)}</b> — ${esc(e.institution)}${e.grade ? " · " + esc(e.grade) : ""}</p>
    `).join("");

    const experienceHtml = (content.experience || []).map(e => `
      <table>
        <tr><td><b>${esc(e.company)}</b></td><td>${esc(e.role)}</td><td>${esc(e.duration)}</td></tr>
      </table>
      <ul>${(e.bullets || []).map(b => `<li>${esc(b)}</li>`).join("")}</ul>
    `).join("");

    const skillsHtml = (content.skills || []).length
      ? `<p>${(content.skills || []).map(esc).join(" &nbsp;·&nbsp; ")}</p>` : "";

    const projectsHtml = (content.projects || []).map(p => `
      <p><b>${esc(p.title)}</b> — ${esc(p.description)}</p>
    `).join("");

    const finalHTML = `
<html>
<head>
<style>
body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #111; }
h1 { font-size: 28px; border-bottom: 3px solid #000; padding-bottom: 5px; margin-bottom: 2px; }
.headline { color: #444; font-size: 14px; margin-bottom: 4px; }
h2 { font-size: 18px; margin-top: 25px; border-bottom: 2px solid #ccc; padding-bottom: 4px; }
p { margin: 5px 0; }
table { width: 100%; border-collapse: collapse; margin-top: 10px; }
td { padding: 4px 0; vertical-align: top; }
ul { margin-top: 5px; margin-bottom: 10px; }
li { margin-bottom: 4px; }
.section { margin-top: 20px; }
</style>
</head>
<body>
  <h1>${esc(data.name)}</h1>
  <div class="headline">${esc(content.headline || "")}</div>
  <p>${esc(data.email)} | ${esc(data.mobile)}</p>

  <div class="section">
    <h2>Professional Summary</h2>
    <p>${esc(content.summary)}</p>
  </div>

  ${experienceHtml ? `<div class="section"><h2>Work Experience</h2>${experienceHtml}</div>` : ""}
  ${educationHtml ? `<div class="section"><h2>Education</h2>${educationHtml}</div>` : ""}
  ${skillsHtml ? `<div class="section"><h2>Skills</h2>${skillsHtml}</div>` : ""}
  ${projectsHtml ? `<div class="section"><h2>Projects</h2>${projectsHtml}</div>` : ""}
</body>
</html>`;

    res.json({ success: true, html: finalHTML });

  } catch (error) {
    console.error("ERROR:", error);
    res.json({ success: false });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
