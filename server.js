import express from "express"
import cors from "cors"
import OpenAI from "openai"

const app = express()

app.use(cors())
app.use(express.json())

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
})

app.post("/generate-resume", async (req,res)=>{

const data=req.body

const prompt=`

Create a professional resume using the following data.

Name: ${data.name}
Mobile: ${data.mobile}
Email: ${data.email}
Certifications: ${data.certifications}

Format a clean modern resume.

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

})

app.listen(3000,()=>{

console.log("AI Resume API running")

})