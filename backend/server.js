
const Fastify = require('fastify')
const axios = require('axios')
const fastify = Fastify({ logger: true })

fastify.get('/api/health', async () => {
  return { status: "ASISTO Backend Running" }
})

fastify.post('/api/ai/ask', async (req, reply) => {
  const { prompt } = req.body
  const response = await axios.post(
    "http://localhost:11434/api/generate",
    { model: "llama3", prompt }
  )
  return response.data
})

fastify.listen({ port: 4000, host: '0.0.0.0' })
