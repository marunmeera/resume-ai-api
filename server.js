import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

app.post("/generate", async (req,res)=>{

try{

const prompt = `Create ATS resume HTML only`;

const response = await fetch("https://api.openai.com/v1/chat/completions",{
method:"POST",
headers:{
"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
"Content-Type":"application/json"
},
body:JSON.stringify({
model:"gpt-4o-mini",
messages:[{role:"user",content:prompt}]
})
});

const data = await response.json();
const html = data.choices?.[0]?.message?.content;

res.json({success:true, html});

}catch{
res.json({success:false});
}

});

app.listen(3000);
