const fs = require('node:fs/promises')
const path = require('node:path')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const axios = require('axios')
const { init } = require('@heyputer/puter.js/src/init.cjs')

const fastify = Fastify({ logger: true })

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434/api/generate'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3'
const HARDCODED_PUTER_AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoiZ3VpIiwidiI6IjAuMC4wIiwidSI6InpjbUFCZGRtU1dXMjRybnlGQjJxT3c9PSIsInV1IjoiL2JsVGYvQTBTM09VVUxXZjgrMDVtZz09IiwiaWF0IjoxNzcyOTc5MzYxfQ._3nA2Rs-VFxQRE8ZXOMslcCWblO1H_xiUBVvSKhr4G0'
const PUTER_AUTH_TOKEN = process.env.PUTER_AUTH_TOKEN || process.env.puterAuthToken || HARDCODED_PUTER_AUTH_TOKEN
const PUTER_MODEL = process.env.PUTER_MODEL || ''
const KNOWLEDGE_DIR = path.join(__dirname, 'data')
const KNOWLEDGE_FILE = path.join(KNOWLEDGE_DIR, 'knowledge.json')
const NEEDS_KNOWLEDGE_PATTERN =
  /\b(latest|today|current|recent|news|weather|price|pricing|version|release|documentation|docs|compare|market|law|regulation|who is|what is|when is|how many|statistics|research)\b/i
const LOW_CONFIDENCE_PATTERN =
  /\b(i do not know|i don't know|not sure|uncertain|no information|cannot verify|can't verify|no current data)\b/i

let puterClient = null

function normalizePrompt(prompt) {
  return String(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function promptLooksKnowledgeHeavy(prompt) {
  return NEEDS_KNOWLEDGE_PATTERN.test(prompt)
}

function getPromptKeywords(prompt) {
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i',
    'in', 'is', 'it', 'me', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
    'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your',
  ])

  return normalizePrompt(prompt)
    .split(' ')
    .filter((word) => word.length > 2 && !stopWords.has(word))
}

function scoreKnowledgeMatch(prompt, entry) {
  const promptWords = new Set(getPromptKeywords(prompt))
  const entryWords = new Set(entry.keywords || [])

  if (!promptWords.size || !entryWords.size) {
    return 0
  }

  let overlap = 0
  for (const word of promptWords) {
    if (entryWords.has(word)) {
      overlap += 1
    }
  }

  return overlap / Math.min(promptWords.size, entryWords.size)
}

async function ensureKnowledgeFile() {
  await fs.mkdir(KNOWLEDGE_DIR, { recursive: true })
  try {
    await fs.access(KNOWLEDGE_FILE)
  } catch (error) {
    await fs.writeFile(KNOWLEDGE_FILE, '[]\n', 'utf8')
  }
}

async function readKnowledgeEntries() {
  await ensureKnowledgeFile()

  try {
    const raw = await fs.readFile(KNOWLEDGE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    fastify.log.error({ err: error }, 'Unable to read knowledge file')
    return []
  }
}

async function writeKnowledgeEntries(entries) {
  await ensureKnowledgeFile()
  await fs.writeFile(KNOWLEDGE_FILE, `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
}

async function findKnowledgeAnswer(prompt) {
  const normalizedPrompt = normalizePrompt(prompt)
  const entries = await readKnowledgeEntries()

  const exactMatch = entries.find((entry) => entry.normalizedPrompt === normalizedPrompt)
  if (exactMatch) {
    return exactMatch
  }

  const rankedMatch = entries
    .map((entry) => ({ entry, score: scoreKnowledgeMatch(prompt, entry) }))
    .sort((left, right) => right.score - left.score)[0]

  if (rankedMatch && rankedMatch.score >= 0.7) {
    return rankedMatch.entry
  }

  return null
}

async function saveKnowledgeAnswer(prompt, answer, metadata = {}) {
  const normalizedPrompt = normalizePrompt(prompt)
  const keywords = getPromptKeywords(prompt)
  const entries = await readKnowledgeEntries()
  const withoutDuplicate = entries.filter((entry) => entry.normalizedPrompt !== normalizedPrompt)

  const nextEntry = {
    prompt,
    normalizedPrompt,
    answer,
    keywords,
    provider: metadata.provider || 'puter',
    model: metadata.model || PUTER_MODEL || 'puter-default',
    createdAt: new Date().toISOString(),
  }

  withoutDuplicate.unshift(nextEntry)
  await writeKnowledgeEntries(withoutDuplicate.slice(0, 200))
  return nextEntry
}

function getPuterClient() {
  if (!PUTER_AUTH_TOKEN) {
    return null
  }

  if (!puterClient) {
    puterClient = init(PUTER_AUTH_TOKEN)
  }

  return puterClient
}

function extractPuterText(result) {
  if (!result) {
    return ''
  }

  if (typeof result === 'string') {
    return result
  }

  if (typeof result.toString === 'function' && result.toString() !== '[object Object]') {
    return result.toString()
  }

  if (typeof result.message?.content === 'string') {
    return result.message.content
  }

  if (Array.isArray(result.message?.content)) {
    return result.message.content
      .map((item) => (typeof item === 'string' ? item : item?.text || ''))
      .join('\n')
      .trim()
  }

  return JSON.stringify(result)
}

async function askOllama(prompt) {
  const response = await axios.post(
    OLLAMA_URL,
    {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    },
    {
      timeout: 120000,
    }
  )

  return {
    provider: 'ollama',
    model: OLLAMA_MODEL,
    response: response.data?.response || '',
  }
}

async function askPuter(prompt) {
  const puter = getPuterClient()

  if (!puter) {
    throw new Error('Puter fallback is not configured. Set PUTER_AUTH_TOKEN first.')
  }

  const options = { stream: false }
  if (PUTER_MODEL) {
    options.model = PUTER_MODEL
  }

  const result = await puter.ai.chat(prompt, options)
  const response = extractPuterText(result)

  return {
    provider: 'puter',
    model: PUTER_MODEL || 'puter-default',
    response,
  }
}

async function resolvePrompt(prompt, preferKnowledge) {
  const shouldUseKnowledgePath = preferKnowledge || promptLooksKnowledgeHeavy(prompt)

  if (shouldUseKnowledgePath) {
    const cachedEntry = await findKnowledgeAnswer(prompt)
    if (cachedEntry) {
      return {
        provider: 'knowledge-cache',
        model: cachedEntry.model,
        response: cachedEntry.answer,
        strategy: 'knowledge-cache',
        cached: true,
      }
    }

    if (getPuterClient()) {
      const puterResult = await askPuter(prompt)
      await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

      return {
        ...puterResult,
        strategy: 'knowledge-fallback',
        cached: false,
      }
    }
  }

  try {
    const ollamaResult = await askOllama(prompt)

    if (LOW_CONFIDENCE_PATTERN.test(ollamaResult.response) && getPuterClient()) {
      const puterResult = await askPuter(prompt)
      await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

      return {
        ...puterResult,
        strategy: 'low-confidence-fallback',
        cached: false,
      }
    }

    return {
      ...ollamaResult,
      strategy: 'local-model',
      cached: false,
    }
  } catch (error) {
    if (!getPuterClient()) {
      throw error
    }

    const puterResult = await askPuter(prompt)
    await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

    return {
      ...puterResult,
      strategy: 'ollama-error-fallback',
      cached: false,
    }
  }
}

fastify.register(cors, {
  origin: true,
})

fastify.get('/api/health', async () => {
  return {
    status: 'ASISTO Backend Running',
    ollamaModel: OLLAMA_MODEL,
    puterConfigured: Boolean(PUTER_AUTH_TOKEN),
  }
})

fastify.post('/api/ai/ask', async (req, reply) => {
  const { prompt, preferKnowledge = false } = req.body || {}

  if (!prompt || !String(prompt).trim()) {
    reply.code(400)
    return { error: 'Prompt is required.' }
  }

  try {
    const result = await resolvePrompt(String(prompt).trim(), Boolean(preferKnowledge))
    return result
  } catch (error) {
    req.log.error({ err: error }, 'AI request failed')
    reply.code(502)
    return {
      error: 'Unable to get an AI response right now.',
      details: error.message,
    }
  }
})

fastify.listen({ port: 4000, host: '0.0.0.0' })
