
import { useState } from 'react'
import axios from 'axios'

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [response, setResponse] = useState("")

  const askAI = async () => {
    const res = await axios.post('/api/ai/ask', { prompt })
    setResponse(JSON.stringify(res.data, null, 2))
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>ASISTO AI Dev Cloud</h1>
      <textarea rows={6} cols={80} value={prompt} onChange={(e)=>setPrompt(e.target.value)} />
      <br /><br />
      <button onClick={askAI}>Ask AI</button>
      <pre>{response}</pre>
    </div>
  )
}
