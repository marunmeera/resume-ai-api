import express from "express"
import cors from "cors"
import OpenAI from "openai"

const app = express()

app.use(cors())
app.use(express.json())

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

app.get("/", (req,res)=>{

res.send("Resume AI API is running")

})

app.post("/generate-resume", async (req,res)=>{

try{

const data = req.body

const prompt = `

You are a professional resume writer.

Create a modern ATS-friendly resume using the candidate data.

Requirements:

• Clear professional summary  
• Bullet points for achievements  
• Action verbs  
• ATS friendly wording  
• Concise professional writing  

Resume sections:

Name  
Contact Information  
Professional Summary  
Core Skills  
Work Experience  
Education  
Certifications  

Candidate Data:

Name: ${data.name}
Mobile: ${data.mobile}
Email: ${data.email}
Certifications: ${data.certifications}

Return ONLY clean HTML.

Use:
<h1> for name
<h2> for section headings
<ul> and <li> for bullet points

Do not include <html> or <body> tags.

`

const completion = await openai.chat.completions.create({

model:"gpt-4o-mini",

messages:[
{role:"user",content:prompt}
]

})

res.json({
resume:completion.choices[0].message.content
})

}catch(error){

res.status(500).json({error:"Resume generation failed"})

}

})

app.listen(3000,()=>{

console.log("Resume AI API running")

})
