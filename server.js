import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/generate", async (req, res) => {

  try {

    const data = req.body;

    // 🔥 PROMPT WITH REAL USER DATA
    const prompt = `
Create a professional ATS-friendly resume in clean HTML format.

STRICT RULES:
- Return ONLY HTML (no explanation)
- Do NOT use placeholder names like John Doe
- Use the candidate data provided below
- Use bullet points for responsibilities
- Keep it clean, structured, and professional

CANDIDATE DETAILS:

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

    // 🔥 CALL OPENAI
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

    // ❌ HANDLE EMPTY RESPONSE
    if (!html) {
      return res.json({ success: false });
    }

    // ✅ CLEAN HTML WRAPPER
    const finalHTML = `
<html>
<head>
<style>
body { font-family: Arial; padding:40px; line-height:1.6; }
h1 { border-bottom:2px solid #000; padding-bottom:5px; }
h2 { margin-top:20px; border-bottom:1px solid #ccc; padding-bottom:3px; }
ul { margin-top:5px; }
p { margin:5px 0; }
</style>
</head>
<body>
${html}
</body>
</html>
`;

    // ✅ RETURN FINAL OUTPUT
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
