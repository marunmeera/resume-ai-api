const data = req.body;

const prompt = `
Create a professional ATS-friendly resume in clean HTML format.

STRICT RULES:
- Return ONLY HTML (no explanation)
- Use real data provided below
- Do NOT use placeholder names like John Doe
- Use bullet points for responsibilities
- Keep it clean and professional

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
