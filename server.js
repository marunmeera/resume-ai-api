const prompt = `

Create a professional ATS-friendly resume.

STRICT RULES:
• Use ONLY the provided data
• Do NOT invent experience or skills
• If no data exists → DO NOT include section

FORMAT:
• Clean HTML
• Section headings
• Bullet points
• Professional layout

DATA:

Name: ${data.name}
Mobile: ${data.mobile}
Email: ${data.email}

Education:
${data.education}

Experience:
${data.experience}

Skills:
${data.skills}

Certifications:
${data.certifications}

Projects:
${data.projects}

Return ONLY HTML.

`
