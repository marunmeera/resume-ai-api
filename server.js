import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" })); // photo as base64 needs more headroom

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// Amount in paise. Single source of truth — never trust price from the client.
const PRICES = { basic: 1900, moderate: 3400, experienced: 4900 };

const TIER_INSTRUCTIONS = {
  basic: "Keep the summary to 2 sentences and each role to 2-3 concise bullet points. Prioritize clarity and brevity over depth.",
  moderate: "Write a 2-3 sentence summary and 3-4 bullet points per role, at standard professional depth.",
  experienced: "Write a comprehensive 3-4 sentence summary emphasizing scope and leadership. Use 4-5 bullet points per role, with strong emphasis on quantified business impact, ownership, and outcomes."
};

const TIER_ACCENT = { basic: "#333333", moderate: "#145C4B", experienced: "#8a5a2b" };

app.post("/create-order", async (req, res) => {
  try {
    const { type } = req.body;
    const amount = PRICES[type];
    if (!amount) return res.json({ success: false, error: "invalid_type" });

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ amount, currency: "INR", receipt: `receipt_${Date.now()}` })
    });
    const order = await orderRes.json();
    if (!order.id) { console.error("ORDER CREATE FAILED:", order); return res.json({ success: false }); }

    res.json({ success: true, order_id: order.id, amount: order.amount, key_id: RAZORPAY_KEY_ID });
  } catch (error) {
    console.error("ORDER ERROR:", error);
    res.json({ success: false });
  }
});

app.post("/generate", async (req, res) => {
  try {
    const data = req.body;
    const payment = data.payment;

    if (!payment || !payment.razorpay_order_id || !payment.razorpay_payment_id || !payment.razorpay_signature) {
      return res.json({ success: false, error: "payment_invalid" });
    }
    const expectedSignature = crypto.createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${payment.razorpay_order_id}|${payment.razorpay_payment_id}`).digest("hex");
    if (expectedSignature !== payment.razorpay_signature) {
      console.warn("SIGNATURE MISMATCH — rejecting generation request");
      return res.json({ success: false, error: "payment_invalid" });
    }

    const tier = PRICES[payment.type] ? payment.type : "basic";
    const academics = (data.academics || []).filter(a => a.institution);
    const experience = (data.experience || []).filter(e => e.title || e.company);
    const certifications = (data.certifications || []).filter(c => c.name);
    const skills = (data.skills || "").split(",").map(s => s.trim()).filter(Boolean);

    const prompt = `You are an award-winning executive resume writer — the kind clients pay ₹15,000+ for privately — now working on this candidate's resume. Your writing should make the candidate feel genuinely proud and confident handing this to anyone, not like it came from templated software.

STRICT RULES:
- Use ONLY the facts given. Never invent employers, dates, qualifications, or numbers that aren't implied by the input.
- Never expand, translate, reinterpret, or guess the meaning of any abbreviation, acronym, or certification name. Reproduce credential names, certification titles, and abbreviations EXACTLY as the candidate typed them — do not add a parenthetical expansion unless the candidate already provided one themselves.
- If the input is genuinely thin for a section, write less rather than pad with generic filler.
- Never use these clichés: "hardworking", "team player", "detail-oriented", "responsible for", "duties included", "passionate about", "results-driven", "dynamic professional", "go-getter".
- Every experience bullet must start with a strong, varied action verb and describe an outcome, not a task. Show the *value created*, not just the activity performed — what changed because this person did the work?
- Quantify wherever the input reasonably allows — but only when justified by what the candidate actually wrote. Do not fabricate numbers.
- Vary sentence structure and rhythm — never start two bullets in the same section with the same verb, and avoid repeating the same sentence shape line after line.
- The summary should read like a confident, specific opening pitch — not a vague statement anyone could claim. It should make a recruiter want to read the rest.
- Every sentence must be grammatically flawless, precise, and free of corporate jargon that says nothing (e.g. "synergy", "leverage cross-functional expertise").
- Before finalizing, mentally check: would a genuinely excellent, highly-paid human resume writer be proud to put their name on this? If any line feels generic or templated, rewrite it sharper and more specific to this candidate.
- CONTENT DEPTH FOR THIS PACKAGE: ${TIER_INSTRUCTIONS[tier]}

CANDIDATE DATA:
Name: ${data.name}
Email: ${data.email}
Mobile: ${data.mobile}
Location: ${data.location || ""}
Career objective (raw, rewrite if present): ${data.objective || ""}

Education: ${JSON.stringify(academics)}
Experience (raw notes to rewrite): ${JSON.stringify(experience)}
Certifications (reproduce names exactly): ${JSON.stringify(certifications)}
Skills: ${JSON.stringify(skills)}
Projects (raw notes to rewrite): ${data.projects || ""}

Return ONLY valid JSON, no markdown fences, no commentary, matching exactly this schema:
{
  "headline": "short professional title line",
  "summary": "professional summary per the content depth instruction above",
  "education": [{"level":"","institution":"","board":"","year":"","score":""}],
  "experience": [{"title":"","company":"","duration":"","bullets":["..."]}],
  "certifications": [{"name":"","issuer":"","year":""}],
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
        model: "claude-sonnet-5",
        max_tokens: 2200,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const result = await response.json();
    let raw = (result.content || []).map(b => b.text || "").join("").trim();
    raw = raw.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();

    let content;
    try { content = JSON.parse(raw); }
    catch (e) { console.error("PARSE ERROR:", raw); return res.json({ success: false }); }
    if (!content || !content.summary) return res.json({ success: false });

    const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const accent = TIER_ACCENT[tier];

    const eduRows = (content.education || []).map(e => `
      <tr><td>${esc(e.level)}</td><td>${esc(e.institution)}</td><td>${esc(e.board)}</td><td>${esc(e.year)}</td><td>${esc(e.score)}</td></tr>
    `).join("");

    const expRows = (content.experience || []).map(e => `
      <tr><td colspan="4"><b>${esc(e.title)}</b> — ${esc(e.company)} <span style="color:#777;">(${esc(e.duration)})</span>
      <ul style="margin:6px 0 0 18px;">${(e.bullets||[]).map(b=>`<li>${esc(b)}</li>`).join("")}</ul></td></tr>
    `).join("");

    const certRows = (content.certifications || []).map(c => `
      <tr><td>${esc(c.name)}</td><td>${esc(c.issuer)}</td><td>${esc(c.year)}</td></tr>
    `).join("");

    const skillsHtml = (content.skills || []).length
      ? `<div class="skills">${(content.skills||[]).map(s=>`<span>${esc(s)}</span>`).join("")}</div>` : "";

    const projectsHtml = (content.projects || []).map(p => `<p><b>${esc(p.title)}</b> — ${esc(p.description)}</p>`).join("");

    const photoHtml = data.photo ? `<img src="${data.photo}">` : "";

    const today = new Date();
    const declarationDate = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const declarationHtml = `
      <div class="section" style="margin-top:24px;">
        <h2>Declaration</h2>
        <p style="font-size:12.5px;color:#333;">I hereby declare that the information provided above is true to the best of my knowledge and belief.</p>
        <table style="width:auto;border:none;margin-top:10px;">
          <tr style="border:none;">
            <td style="border:none;padding:0;font-size:12.5px;">Place: ${esc(data.location || "")}</td>
          </tr>
          <tr style="border:none;">
            <td style="border:none;padding:0;font-size:12.5px;">Date: ${declarationDate}</td>
          </tr>
        </table>
        <p style="margin-top:16px;font-size:13px;font-weight:600;">${esc(data.name)}</p>
      </div>`;

    const finalHTML = `
<html><head><style>
body { font-family: Arial, sans-serif; padding: 36px; line-height: 1.55; color: #111; }
.header-row { display:flex; align-items:flex-start; gap:18px; border-bottom:3px solid ${accent}; padding-bottom:10px; margin-bottom:16px; }
.header-row img { width:80px; height:80px; object-fit:cover; border-radius:4px; }
h1 { font-size:26px; margin:0; }
.headline { color:${accent}; font-size:13.5px; font-weight:600; margin-top:2px; }
.contact { font-size:12.5px; color:#555; margin-top:4px; }
h2 { font-size:15px; text-transform:uppercase; letter-spacing:.5px; color:${accent}; border-bottom:1px solid #ddd; padding-bottom:4px; margin-top:22px; margin-bottom:8px; }
table { width:100%; border-collapse:collapse; font-size:13px; }
th { text-align:left; background:#f3f3f3; padding:6px 8px; font-size:11px; text-transform:uppercase; color:#555; border:1px solid #e0e0e0; }
td { padding:6px 8px; border:1px solid #e0e0e0; vertical-align:top; }
li { margin-bottom:3px; }
.skills span { display:inline-block; background:#f0f0f0; padding:3px 10px; margin:2px; border-radius:2px; font-size:12px; }
.section { margin-top:14px; }
</style></head>
<body>
  <div class="header-row">
    ${photoHtml}
    <div>
      <h1>${esc(data.name)}</h1>
      <div class="headline">${esc(content.headline || "")}</div>
      <div class="contact">${[data.mobile, data.email, data.location].filter(Boolean).map(esc).join(" | ")}</div>
    </div>
  </div>

  <div class="section"><h2>Summary</h2><p>${esc(content.summary)}</p></div>

  ${expRows ? `<div class="section"><h2>Work Experience</h2><table>${expRows}</table></div>` : ""}
  ${eduRows ? `<div class="section"><h2>Education</h2><table><tr><th>Level</th><th>Institution</th><th>Board</th><th>Year</th><th>Score</th></tr>${eduRows}</table></div>` : ""}
  ${certRows ? `<div class="section"><h2>Certifications</h2><table><tr><th>Name</th><th>Issuer</th><th>Year</th></tr>${certRows}</table></div>` : ""}
  ${skillsHtml ? `<div class="section"><h2>Skills</h2>${skillsHtml}</div>` : ""}
  ${projectsHtml ? `<div class="section"><h2>Projects</h2>${projectsHtml}</div>` : ""}
  ${declarationHtml}
</body></html>`;

    res.json({ success: true, html: finalHTML });

  } catch (error) {
    console.error("ERROR:", error);
    res.json({ success: false });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
