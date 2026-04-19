const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { Blob: NodeBlob, File: NodeFile } = require('node:buffer')
const Fastify = require('fastify')
const cors = require('@fastify/cors')
const axios = require('axios')

const fastify = Fastify({ logger: true })

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434/api/generate'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'asisto-coder'
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 600000)
const ENCRYPTED_PUTER_AUTH_TOKEN = {
  iv: '7eaf3123b19552d24123382808eb0d47',
  value: '2fb3f923c93c8e07133ac4612e77767960bd1ad6e334f74340498068c1f44ef567055c21d401fd66b54db5f187ef306d169d28698b7fcf954079f280b1450faeb711d03d5d420d91275455b44d0a20075edb5254368eb2282842f76067c15cd024167db66fbb6a6e1dc989b2a89b4b9e4b2d9c5fc7f80e3f2ba74d81ae0377328d06c741b055fc4ae2ec1a23923b92e9b759f3db708dcf437d1712b7902b3c0feebc728e7beff6aa7e4f26613a2dbd7c063c5c6903e5269e5d4e8d7ccb9e998bd71bc68b413fcc75c8c02a40c7affb8565fc52d7037e40fe4bec0e2b6237c0fe',
}
const TOKEN_SECRET_PARTS = ['asisto', 'puter', 'fallback::token', 'v1']
const PUTER_AUTH_TOKEN =
  process.env.PUTER_AUTH_TOKEN ||
  process.env.puterAuthToken ||
  decryptHardcodedToken(ENCRYPTED_PUTER_AUTH_TOKEN)
const PUTER_MODEL = process.env.PUTER_MODEL || ''
const KNOWLEDGE_DIR = path.join(__dirname, 'data')
const KNOWLEDGE_FILE = path.join(KNOWLEDGE_DIR, 'knowledge.json')
const NEEDS_KNOWLEDGE_PATTERN =
  /\b(latest|today|current|recent|news|weather|price|pricing|version|release|documentation|docs|compare|market|law|regulation|who is|what is|when is|how many|statistics|research)\b/i
const LOW_CONFIDENCE_PATTERN =
  /\b(i do not know|i don't know|not sure|uncertain|no information|cannot verify|can't verify|no current data)\b/i

let puterClient = null

function decryptHardcodedToken(payload) {
  const passphrase = TOKEN_SECRET_PARTS.join('-')
  const key = crypto.createHash('sha256').update(passphrase).digest()
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    key,
    Buffer.from(payload.iv, 'hex')
  )

  return Buffer.concat([
    decipher.update(Buffer.from(payload.value, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

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
    puterClient = createPuterClient(PUTER_AUTH_TOKEN)
  }

  return puterClient
}

function ensurePuterGlobals() {
  if (!globalThis.Blob) {
    globalThis.Blob = NodeBlob
  }

  if (!globalThis.File) {
    globalThis.File = NodeFile
  }

  if (!globalThis.CustomEvent) {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(name, params = {}) {
        super(name, params)
        this.detail = params.detail
      }
    }
  }
}

function createPuterClient(authToken) {
  ensurePuterGlobals()

  require('@heyputer/puter.js/dist/puter.cjs')

  if (!globalThis.puter) {
    throw new Error('Puter client failed to initialize.')
  }

  if (authToken) {
    globalThis.puter.setAuthToken(authToken)
  }

  return globalThis.puter
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error.message === 'string' && error.message) {
    return error.message
  }

  if (typeof error.error?.message === 'string' && error.error.message) {
    return error.error.message
  }

  if (typeof error.response?.data?.error === 'string' && error.response.data.error) {
    return error.response.data.error
  }

  if (typeof error.response?.data?.details === 'string' && error.response.data.details) {
    return error.response.data.details
  }

  try {
    return JSON.stringify(error)
  } catch (jsonError) {
    return fallbackMessage
  }
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
  try {
    const response = await axios.post(
      OLLAMA_URL,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      },
      {
        timeout: OLLAMA_TIMEOUT_MS,
      }
    )

    return {
      provider: 'ollama',
      model: OLLAMA_MODEL,
      response: response.data?.response || '',
    }
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(
        `Ollama timed out after ${Math.round(OLLAMA_TIMEOUT_MS / 1000)} seconds.`
      )
    }

    throw new Error(getErrorMessage(error, 'Ollama request failed.'))
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

  try {
    const result = await puter.ai.chat(prompt, options)
    const response = extractPuterText(result)

    return {
      provider: 'puter',
      model: PUTER_MODEL || 'puter-default',
      response,
    }
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Puter request failed.'))
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
      try {
        const puterResult = await askPuter(prompt)
        await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

        return {
          ...puterResult,
          strategy: 'knowledge-fallback',
          cached: false,
        }
      } catch (error) {
        fastify.log.warn(
          { err: error },
          'Puter knowledge fallback failed, continuing with Ollama'
        )
      }
    }
  }

  try {
    const ollamaResult = await askOllama(prompt)

    if (LOW_CONFIDENCE_PATTERN.test(ollamaResult.response) && getPuterClient()) {
      try {
        const puterResult = await askPuter(prompt)
        await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

        return {
          ...puterResult,
          strategy: 'low-confidence-fallback',
          cached: false,
        }
      } catch (error) {
        fastify.log.warn(
          { err: error },
          'Puter low-confidence fallback failed, returning Ollama response'
        )
      }
    }

    return {
      ...ollamaResult,
      strategy: 'local-model',
      cached: false,
    }
  } catch (error) {
    if (!shouldUseKnowledgePath || !getPuterClient()) {
      throw error
    }

    try {
      const puterResult = await askPuter(prompt)
      await saveKnowledgeAnswer(prompt, puterResult.response, puterResult)

      return {
        ...puterResult,
        strategy: 'ollama-error-fallback',
        cached: false,
      }
    } catch (puterError) {
      fastify.log.warn(
        { err: puterError },
        'Puter fallback failed after Ollama error'
      )
      throw error
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

fastify.get('/api/files/read', async (req, reply) => {
  const { path: filePath } = req.query
  if (!filePath || typeof filePath !== 'string') {
    reply.code(400)
    return { error: 'path query parameter required' }
  }

  try {
    const absolutePath = require('path').join(process.cwd(), filePath)
    const envRoot = require('path').join(process.cwd(), 'environments')

    if (!absolutePath.startsWith(envRoot) || absolutePath.includes('..')) {
      reply.code(403)
      return { error: 'invalid path' }
    }

    const content = await fs.readFile(absolutePath, 'utf8')
    return { content, path: filePath }
  } catch (error) {
    reply.code(500)
    return { error: error.message }
  }
})

fastify.post('/api/files/write', async (req, reply) => {
  const { path: filePath, content } = req.body || {}
  if (!filePath || !content) {
    reply.code(400)
    return { error: 'path and content required' }
  }

  try {
    const absolutePath = require('path').join(process.cwd(), filePath)
    const envRoot = require('path').join(process.cwd(), 'environments')

    if (!absolutePath.startsWith(envRoot) || absolutePath.includes('..')) {
      reply.code(403)
      return { error: 'invalid path' }
    }

    await fs.mkdir(require('path').dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, content, 'utf8')
    return { success: true, path: filePath, bytesWritten: content.length }
  } catch (error) {
    reply.code(500)
    return { error: error.message }
  }
})

fastify.post('/api/files/diff', async (req, reply) => {
  const { original = '', modified = '' } = req.body || {}

  const originalLines = original.split('\n')
  const modifiedLines = modified.split('\n')

  const diff = []
  let i = 0, j = 0

  while (i < originalLines.length || j < modifiedLines.length) {
    if (i < originalLines.length && j < modifiedLines.length) {
      if (originalLines[i] === modifiedLines[j]) {
        diff.push({ type: 'context', line: originalLines[i], lineNum: i + 1 })
        i++
        j++
      } else {
        diff.push({ type: 'removed', line: originalLines[i], lineNum: i + 1 })
        diff.push({ type: 'added', line: modifiedLines[j], lineNum: j + 1 })
        i++
        j++
      }
    } else if (i < originalLines.length) {
      diff.push({ type: 'removed', line: originalLines[i], lineNum: i + 1 })
      i++
    } else {
      diff.push({ type: 'added', line: modifiedLines[j], lineNum: j + 1 })
      j++
    }
  }

  return { diff }
})

fastify.listen({ port: 4000, host: '0.0.0.0' })
