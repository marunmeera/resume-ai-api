import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/generate", async (req, res) => {

  try {

    const data = req.body;

    // 🔥 PREMIUM PROMPT (REVATHI-LEVEL)
    const prompt = `
Create a PREMIUM, recruiter-level resume in CLEAN HTML format.

STRICT RULES:
- Return ONLY HTML (no explanation)
- Use ONLY the candidate data provided
- Do NOT use placeholders like John Doe
- Do NOT invent fake experience

DESIGN REQUIREMENTS:
- Professional layout
- Clear section separation
- Use tables for experience alignment
- Use bullet points for responsibilities
- Maintain perfect spacing and alignment
- Make it visually clean and modern

STRUCTURE:

1. Name (Large Heading)
2. Contact (Single Line)
3. Professional Summary (2–3 lines)
4. Work Experience (TABLE FORMAT)
   Columns: Company | Role | Duration
   Below each → bullet points
5. Education
6. Skills
7. Projects

CANDIDATE DATA:

Name: ${data.name}
Email: ${data.email}
Mobile: ${data.mobile}

Education:
${JSON.stringify(data.academics)}

Experience:
${JSON.stringify(data.experience)}

Skills:
${JSON.stringify(data.skills)}

Projects:
${data.projects}
`;

    // 🔥 OPENAI CALL
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const result = await response.json();

    const html = result.choices?.[0]?.message?.content;

    // ❌ FAIL SAFE
    if (!html) {
      return res.json({ success: false });
    }

    // ✅ PREMIUM WRAPPER
    const finalHTML = `
<html>
<head>
<style>
body {
  font-family: Arial, sans-serif;
  padding: 40px;
  line-height: 1.6;
  color: #111;
}

h1 {
  font-size: 28px;
  border-bottom: 3px solid #000;
  padding-bottom: 5px;
}

h2 {
  font-size: 18px;
  margin-top: 25px;
  border-bottom: 2px solid #ccc;
  padding-bottom: 4px;
}

p {
  margin: 5px 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}

td {
  padding: 8px;
  border-bottom: 1px solid #ddd;
  vertical-align: top;
}

ul {
  margin-top: 5px;
  margin-bottom: 10px;
}

li {
  margin-bottom: 4px;
}

.section {
  margin-top: 20px;
}
</style>
</head>

<body>

${html}

</body>
</html>
`;

    res.json({
      success: true,
      html: finalHTML
    });

  } catch (error) {

    console.error("ERROR:", error);

    res.json({
      success: false
    });

  }

});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
