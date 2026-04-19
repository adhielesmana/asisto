const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const axios = require('axios')

const AI_DATA_DIR = path.join(__dirname, '..', 'data', 'ai')
const AI_STORE_FILE = path.join(AI_DATA_DIR, 'store.json')
const AI_TRAINING_FILE = path.join(AI_DATA_DIR, 'training.jsonl')
const AI_MEMORY_LIMIT = Number(process.env.AI_MEMORY_LIMIT || 500)

const OPENAI_LATEST_MODEL = process.env.OPENAI_LATEST_MODEL || 'gpt-5.2'
const OPENAI_MINI_MODEL = process.env.OPENAI_MINI_MODEL || 'gpt-5.4-mini'
const OPENAI_CHEAPEST_MODEL = process.env.OPENAI_CHEAPEST_MODEL || 'gpt-5.4-nano'

const ANTHROPIC_OPUS_MODEL = process.env.ANTHROPIC_OPUS_MODEL || 'claude-opus-4-1-20250805'
const ANTHROPIC_SONNET_MODEL = process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-20250514'
const ANTHROPIC_HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-3-5-haiku-20241022'

const OLLAMA_ACTION_MODEL = process.env.OLLAMA_ACTION_MODEL || 'llama3'
const OLLAMA_LEGACY_MODEL = process.env.OLLAMA_MODEL || 'asisto-coder'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434/api/generate'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'me',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your',
])

const LOW_CONFIDENCE_PATTERN =
  /\b(i do not know|i don't know|not sure|uncertain|no information|cannot verify|can't verify|no current data|i cannot help|i’m unable to|i am unable to)\b/i

function nowIso() {
  return new Date().toISOString()
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
}

function normalizePhase(value) {
  const phase = String(value || '').trim().toLowerCase()
  if (phase === 'plan' || phase === 'action' || phase === 'intermediate') {
    return phase
  }

  return ''
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordsFromText(text) {
  return normalizeText(text)
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

function scoreOverlap(left, right) {
  const leftWords = new Set(keywordsFromText(left))
  const rightWords = new Set(keywordsFromText(right))

  if (!leftWords.size || !rightWords.size) {
    return 0
  }

  let overlap = 0
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      overlap += 1
    }
  }

  return overlap / Math.min(leftWords.size, rightWords.size)
}

function createEmptyStore() {
  return {
    sessions: {},
    memory: [],
  }
}

async function ensureDataFiles() {
  await fs.mkdir(AI_DATA_DIR, { recursive: true })

  try {
    await fs.access(AI_STORE_FILE)
  } catch (error) {
    await fs.writeFile(AI_STORE_FILE, `${JSON.stringify(createEmptyStore(), null, 2)}\n`, 'utf8')
  }

  try {
    await fs.access(AI_TRAINING_FILE)
  } catch (error) {
    await fs.writeFile(AI_TRAINING_FILE, '', 'utf8')
  }
}

async function readStore() {
  await ensureDataFiles()

  try {
    const raw = await fs.readFile(AI_STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      sessions: parsed?.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      memory: Array.isArray(parsed?.memory) ? parsed.memory : [],
    }
  } catch (error) {
    return createEmptyStore()
  }
}

async function writeStore(store) {
  await ensureDataFiles()
  const serialized = `${JSON.stringify(store, null, 2)}\n`
  const tmpFile = `${AI_STORE_FILE}.${process.pid}.tmp`
  await fs.writeFile(tmpFile, serialized, 'utf8')
  await fs.rename(tmpFile, AI_STORE_FILE)
}

async function appendTrainingRecord(record) {
  await ensureDataFiles()
  await fs.appendFile(AI_TRAINING_FILE, `${JSON.stringify(record)}\n`, 'utf8')
}

function buildModelRegistry() {
  return {
    openai: {
      latest: OPENAI_LATEST_MODEL,
      mini: OPENAI_MINI_MODEL,
      cheapest: OPENAI_CHEAPEST_MODEL,
      configured: Boolean(OPENAI_API_KEY),
    },
    anthropic: {
      opus: ANTHROPIC_OPUS_MODEL,
      sonnet: ANTHROPIC_SONNET_MODEL,
      haiku: ANTHROPIC_HAIKU_MODEL,
      configured: Boolean(ANTHROPIC_API_KEY),
    },
    ollama: {
      action: OLLAMA_ACTION_MODEL,
      legacy: OLLAMA_LEGACY_MODEL,
      configured: true,
    },
  }
}

function buildHealth() {
  const models = buildModelRegistry()
  return {
    configured: {
      openai: models.openai.configured,
      anthropic: models.anthropic.configured,
      ollama: models.ollama.configured,
    },
    models,
    phases: {
      plan: {
        primary: models.openai.latest,
        review: models.anthropic.opus,
      },
      action: {
        primary: models.ollama.action,
        fallback: `${models.openai.mini} + ${models.anthropic.haiku}`,
      },
      intermediate: {
        primary: models.anthropic.sonnet,
      },
    },
  }
}

function extractOpenAIText(payload) {
  if (!payload) {
    return ''
  }

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  if (Array.isArray(payload.output)) {
    const parts = []
    for (const item of payload.output) {
      if (!item) continue
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block?.type === 'output_text' && typeof block.text === 'string') {
            parts.push(block.text)
          } else if (block?.type === 'text' && typeof block.text === 'string') {
            parts.push(block.text)
          }
        }
      }
    }
    const joined = parts.join('\n').trim()
    if (joined) {
      return joined
    }
  }

  return ''
}

function extractAnthropicText(payload) {
  if (!payload || !Array.isArray(payload.content)) {
    return ''
  }

  return payload.content
    .map((block) => (block?.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('\n')
    .trim()
}

async function callOpenAI({ model, prompt, instructions, reasoningEffort, maxOutputTokens }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }

  const payload = {
    model,
    input: prompt,
    instructions,
    reasoning: {
      effort: reasoningEffort,
    },
    max_output_tokens: maxOutputTokens,
  }

  const response = await axios.post('https://api.openai.com/v1/responses', payload, {
    timeout: 120000,
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  return {
    provider: 'openai',
    model,
    response: extractOpenAIText(response.data),
    raw: response.data,
    usage: response.data?.usage || null,
  }
}

async function callAnthropic({ model, system, prompt, maxTokens, thinkingBudget }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.')
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  }

  if (thinkingBudget && !model.includes('haiku')) {
    payload.thinking = {
      type: 'enabled',
      budget_tokens: thinkingBudget,
    }
  }

  const response = await axios.post('https://api.anthropic.com/v1/messages', payload, {
    timeout: 120000,
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
  })

  return {
    provider: 'anthropic',
    model,
    response: extractAnthropicText(response.data),
    raw: response.data,
    usage: response.data?.usage || null,
  }
}

async function callOllama({ model, prompt }) {
  const response = await axios.post(
    OLLAMA_URL,
    {
      model,
      prompt,
      stream: false,
    },
    {
      timeout: 600000,
    }
  )

  return {
    provider: 'ollama',
    model,
    response: String(response.data?.response || '').trim(),
    raw: response.data,
    usage: response.data?.usage || null,
  }
}

function formatProviderSection(title, result) {
  if (!result || !result.response) {
    return ''
  }

  return [`## ${title}`, result.response.trim()].join('\n')
}

function mergeTextResults({ title, primary, secondary, notes = [] }) {
  const sections = [`# ${title}`]

  const primarySection = formatProviderSection(primary?.label || 'Primary', primary)
  if (primarySection) {
    sections.push(primarySection)
  }

  const secondarySection = formatProviderSection(secondary?.label || 'Review', secondary)
  if (secondarySection) {
    sections.push(secondarySection)
  }

  if (notes.length) {
    sections.push('## Orchestration Notes')
    for (const note of notes) {
      sections.push(`- ${note}`)
    }
  }

  return sections.join('\n\n').trim()
}

function buildSessionSnapshot(session) {
  if (!session) {
    return null
  }

  return {
    taskId: session.taskId,
    status: session.status,
    goal: session.goal,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    planEntryId: session.planEntryId || null,
    intermediateEntryIds: Array.isArray(session.intermediateEntryIds) ? session.intermediateEntryIds : [],
    actionEntryIds: Array.isArray(session.actionEntryIds) ? session.actionEntryIds : [],
  }
}

function findMemoryById(store, id) {
  return store.memory.find((entry) => entry.id === id) || null
}

function findSession(store, taskId) {
  if (!taskId) {
    return null
  }

  return store.sessions[taskId] || null
}

function updateSession(store, taskId, updater) {
  const current = store.sessions[taskId] || {
    taskId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'created',
    goal: '',
    planEntryId: '',
    intermediateEntryIds: [],
    actionEntryIds: [],
  }

  const next = updater({ ...current })
  next.updatedAt = nowIso()
  store.sessions[taskId] = next
  return next
}

function createMemoryEntry({ taskId, phase, prompt, response, models, strategy, context = '', summary = '' }) {
  const keywords = keywordsFromText(`${prompt}\n${response}\n${context}`)

  return {
    id: generateId('mem'),
    taskId,
    phase,
    prompt,
    response,
    summary: summary || response.slice(0, 800),
    models,
    strategy,
    context,
    keywords,
    createdAt: nowIso(),
  }
}

function scoreMemoryMatch(query, entry, taskId) {
  let score = scoreOverlap(query, `${entry.prompt}\n${entry.summary}\n${entry.response}`)

  if (taskId && entry.taskId === taskId) {
    score += 0.6
  }

  if (entry.phase === 'plan') {
    score += 0.1
  }

  if (entry.phase === 'intermediate') {
    score += 0.05
  }

  return score
}

function getRelevantMemory(store, query, taskId, limit = 4) {
  return store.memory
    .map((entry) => ({
      entry,
      score: scoreMemoryMatch(query, entry, taskId),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

function buildPlanPrompt({ prompt, context, taskId }) {
  const sections = [
    'You are phase 1 in a multi-model coding workflow.',
    'Your job is to create a strong plan that can later drive implementation in a separate action phase.',
    'Return concise markdown only with these headings:',
    '- Summary',
    '- Key Changes',
    '- Assumptions',
    '- Risks',
    '- Validation',
    '- Phase 2 Guardrails',
    '- Training Notes',
    '',
    'Focus on implementation safety and concrete steps.',
    'Do not write chain-of-thought.',
    'Do not mention internal policies.',
    '',
    `Task ID: ${taskId}`,
    `User request: ${prompt}`,
  ]

  if (context) {
    sections.push('', 'Extra context:', context)
  }

  return sections.join('\n')
}

function buildIntermediatePrompt({ prompt, context, session, memorySnippets }) {
  const sections = [
    'You are phase 3 in a multi-model coding workflow.',
    'You respond to mid-session clarifications or intermediate requests.',
    'Keep the response concise, practical, and aligned with the current plan.',
    'Return markdown only with sections for Summary, Guidance, and Any Updated Constraints.',
    '',
    `Task ID: ${session.taskId}`,
    `Current plan goal: ${session.goal || 'unknown'}`,
    '',
    'Current plan:',
    session.planText || 'No plan text stored yet.',
  ]

  if (memorySnippets.length) {
    sections.push('', 'Relevant memory:')
    for (const snippet of memorySnippets) {
      sections.push(`- ${snippet.summary || snippet.response.slice(0, 180)}`)
    }
  }

  if (context) {
    sections.push('', 'Extra context:', context)
  }

  sections.push('', `User message: ${prompt}`)
  return sections.join('\n')
}

function buildActionPrompt({ prompt, context, session, memorySnippets }) {
  const sections = [
    'You are phase 2 in a multi-model coding workflow.',
    'You must follow the existing plan and may not respond directly from the raw prompt alone.',
    'The local action model is the primary executor.',
    'Use the stored plan and prior intermediate notes as the source of truth.',
    'If the task asks for code, provide implementation-oriented markdown with:',
    '- Summary',
    '- Files to Touch',
    '- Code Changes',
    '- Commands',
    '- Risks',
    '- Validation',
    '- Next Steps',
    '',
    `Task ID: ${session.taskId}`,
    `Plan goal: ${session.goal || 'unknown'}`,
    '',
    'Stored plan:',
    session.planText || 'No plan text stored yet.',
  ]

  if (memorySnippets.length) {
    sections.push('', 'Relevant memory:')
    for (const snippet of memorySnippets) {
      sections.push(`- ${snippet.summary || snippet.response.slice(0, 180)}`)
    }
  }

  if (context) {
    sections.push('', 'Extra context:', context)
  }

  sections.push('', `User action request: ${prompt}`)
  return sections.join('\n')
}

async function persistMemoryAndTraining({
  taskId,
  phase,
  prompt,
  response,
  models,
  strategy,
  context = '',
  summary = '',
}) {
  const store = await readStore()

  const entry = createMemoryEntry({
    taskId,
    phase,
    prompt,
    response,
    models,
    strategy,
    context,
    summary,
  })

  store.memory.unshift(entry)
  if (store.memory.length > AI_MEMORY_LIMIT) {
    store.memory = store.memory.slice(0, AI_MEMORY_LIMIT)
  }

  await writeStore(store)

  await appendTrainingRecord({
    id: entry.id,
    taskId,
    phase,
    prompt,
    response,
    models,
    strategy,
    context,
    createdAt: entry.createdAt,
  })

  return entry
}

async function saveSessionPlan({ taskId, prompt, response, models, strategy, entryId }) {
  const store = await readStore()
  const session = updateSession(store, taskId, (current) => ({
    ...current,
    goal: current.goal || prompt,
    status: 'planned',
    lastPhase: 'plan',
    planText: response,
    planModels: models,
    planStrategy: strategy,
    planEntryId: entryId || current.planEntryId || null,
  }))

  await writeStore(store)
  return session
}

async function saveSessionIntermediate({
  taskId,
  prompt,
  response,
  models,
  strategy,
  entryId,
}) {
  const store = await readStore()
  const session = updateSession(store, taskId, (current) => {
    const ids = Array.isArray(current.intermediateEntryIds) ? current.intermediateEntryIds : []
    return {
      ...current,
      status: 'intermediate',
      lastPhase: 'intermediate',
      lastIntermediatePrompt: prompt,
      lastIntermediateText: response,
      lastIntermediateModels: models,
      lastIntermediateStrategy: strategy,
      intermediateEntryIds: entryId && !ids.includes(entryId) ? [...ids, entryId] : ids,
    }
  })

  await writeStore(store)
  return session
}

async function saveSessionAction({ taskId, prompt, response, models, strategy, entryId }) {
  const store = await readStore()
  const session = updateSession(store, taskId, (current) => {
    const ids = Array.isArray(current.actionEntryIds) ? current.actionEntryIds : []
    return {
      ...current,
      status: 'actioned',
      lastPhase: 'action',
      lastActionPrompt: prompt,
      lastActionText: response,
      lastActionModels: models,
      lastActionStrategy: strategy,
      actionEntryIds: entryId && !ids.includes(entryId) ? [...ids, entryId] : ids,
    }
  })

  await writeStore(store)
  return session
}

function formatPlanNotes(openaiResult, anthropicResult) {
  const notes = []

  if (openaiResult && anthropicResult) {
    notes.push(`Primary plan came from ${openaiResult.model}; Claude Opus reviewed and was preserved for later phase 2 context.`)
  } else if (openaiResult) {
    notes.push(`Only ${openaiResult.model} was available for phase 1, so the workflow used the OpenAI plan alone.`)
  } else if (anthropicResult) {
    notes.push(`Only ${anthropicResult.model} was available for phase 1, so the workflow used the Claude plan alone.`)
  }

  notes.push('The stored plan is written to local disk and appended to the training corpus for later Llama grounding.')

  return notes
}

function formatFallbackNotes(openaiResult, anthropicResult) {
  const notes = []

  if (openaiResult && anthropicResult) {
    notes.push(`Fallback blended ${openaiResult.model} with ${anthropicResult.model} after the local model showed low confidence.`)
  } else if (openaiResult) {
    notes.push(`Fallback used ${openaiResult.model} because Anthropic was not available.`)
  } else if (anthropicResult) {
    notes.push(`Fallback used ${anthropicResult.model} because OpenAI was not available.`)
  }

  notes.push('The fallback response also stays in the local memory corpus for later retrieval.')

  return notes
}

async function handlePlanPhase({ prompt, context = '', taskId = '' }) {
  const effectiveTaskId = taskId || generateId('task')
  const planPrompt = buildPlanPrompt({ prompt, context, taskId: effectiveTaskId })

  const openaiPromise = OPENAI_API_KEY
    ? callOpenAI({
        model: OPENAI_LATEST_MODEL,
        prompt: planPrompt,
        instructions:
          'You are a planning assistant for an AI coding workflow. Produce concise markdown that can drive implementation.',
        reasoningEffort: 'high',
        maxOutputTokens: 5000,
      })
    : Promise.resolve(null)

  const anthropicPromise = ANTHROPIC_API_KEY
    ? callAnthropic({
        model: ANTHROPIC_OPUS_MODEL,
        system:
          'You are the plan review model for an AI coding workflow. Produce concise markdown only and focus on implementation safety.',
        prompt: planPrompt,
        maxTokens: 5000,
        thinkingBudget: 4096,
      })
    : Promise.resolve(null)

  const [openaiResult, anthropicResult] = await Promise.all([openaiPromise, anthropicPromise])

  if (!openaiResult && !anthropicResult) {
    throw new Error('Phase 1 requires either OPENAI_API_KEY or ANTHROPIC_API_KEY.')
  }

  const notes = formatPlanNotes(openaiResult, anthropicResult)
  const combinedResponse = mergeTextResults({
    title: 'Phase 1 Plan',
    primary: openaiResult
      ? { ...openaiResult, label: `OpenAI ${OPENAI_LATEST_MODEL}` }
      : anthropicResult
        ? { ...anthropicResult, label: `Claude ${ANTHROPIC_OPUS_MODEL}` }
        : null,
    secondary:
      openaiResult && anthropicResult
        ? { ...anthropicResult, label: `Claude ${ANTHROPIC_OPUS_MODEL}` }
        : null,
    notes,
  })

  const primaryModels = []
  if (openaiResult) {
    primaryModels.push({ provider: openaiResult.provider, model: openaiResult.model })
  }
  if (anthropicResult) {
    primaryModels.push({ provider: anthropicResult.provider, model: anthropicResult.model })
  }

  const memoryEntry = await persistMemoryAndTraining({
    taskId: effectiveTaskId,
    phase: 'plan',
    prompt,
    response: combinedResponse,
    models: primaryModels,
    strategy: 'plan-consensus',
    context,
    summary: combinedResponse.slice(0, 800),
  })

  const session = await saveSessionPlan({
    taskId: effectiveTaskId,
    prompt,
    response: combinedResponse,
    models: primaryModels,
    strategy: 'plan-consensus',
    entryId: memoryEntry.id,
  })

  return {
    phase: 'plan',
    taskId: effectiveTaskId,
    provider: openaiResult && anthropicResult ? 'openai+anthropic' : openaiResult ? 'openai' : 'anthropic',
    model:
      openaiResult && anthropicResult
        ? `${OPENAI_LATEST_MODEL} + ${ANTHROPIC_OPUS_MODEL}`
        : openaiResult
          ? OPENAI_LATEST_MODEL
          : ANTHROPIC_OPUS_MODEL,
    strategy: 'phase-1-plan',
    response: combinedResponse,
    memoryId: memoryEntry.id,
    session: buildSessionSnapshot(session),
    sources: {
      openai: openaiResult,
      anthropic: anthropicResult,
    },
  }
}

async function handleIntermediatePhase({ prompt, context = '', taskId = '' }) {
  if (!taskId) {
    throw new Error('Phase 3 requires taskId from the plan phase.')
  }

  const store = await readStore()
  const session = findSession(store, taskId)
  if (!session || !session.planText) {
    throw new Error('Phase 3 requires an existing plan. Run phase 1 first.')
  }

  const memorySnippets = getRelevantMemory(store, prompt, taskId, 3)
  const intermediatePrompt = buildIntermediatePrompt({
    prompt,
    context,
    session,
    memorySnippets,
  })

  let anthropicResult = null
  let openaiResult = null

  if (ANTHROPIC_API_KEY) {
    anthropicResult = await callAnthropic({
      model: ANTHROPIC_SONNET_MODEL,
      system:
        'You are the intermediate chat model in an AI coding workflow. Keep the reply brief, practical, and aligned with the stored plan.',
      prompt: intermediatePrompt,
      maxTokens: 4000,
      thinkingBudget: 2048,
    })
  } else if (OPENAI_API_KEY) {
    openaiResult = await callOpenAI({
      model: OPENAI_LATEST_MODEL,
      prompt: intermediatePrompt,
      instructions:
        'You are the intermediate chat model in an AI coding workflow. Keep the reply brief, practical, and aligned with the stored plan.',
      reasoningEffort: 'medium',
      maxOutputTokens: 4000,
    })
  } else {
    throw new Error('Phase 3 requires ANTHROPIC_API_KEY or OPENAI_API_KEY.')
  }

  const primary = anthropicResult
    ? { ...anthropicResult, label: `Claude ${ANTHROPIC_SONNET_MODEL}` }
    : openaiResult
      ? { ...openaiResult, label: `OpenAI ${OPENAI_LATEST_MODEL}` }
      : null

  const combinedResponse = mergeTextResults({
    title: 'Phase 3 Intermediate Update',
    primary,
    notes: [
      'This response is stored locally and can be reused as memory for later phase 2 actions.',
      `Task ${taskId} remains anchored to the original plan.`,
    ],
  })

  const models = []
  if (anthropicResult) {
    models.push({ provider: anthropicResult.provider, model: anthropicResult.model })
  }
  if (openaiResult) {
    models.push({ provider: openaiResult.provider, model: openaiResult.model })
  }

  const memoryEntry = await persistMemoryAndTraining({
    taskId,
    phase: 'intermediate',
    prompt,
    response: combinedResponse,
    models,
    strategy: 'phase-3-sonnet',
    context,
    summary: combinedResponse.slice(0, 800),
  })

  const updatedSession = await saveSessionIntermediate({
    taskId,
    prompt,
    response: combinedResponse,
    models,
    strategy: 'phase-3-sonnet',
    entryId: memoryEntry.id,
  })

  return {
    phase: 'intermediate',
    taskId,
    provider: primary?.provider || 'anthropic',
    model: primary?.model || ANTHROPIC_SONNET_MODEL,
    strategy: 'phase-3-intermediate',
    response: combinedResponse,
    memoryId: memoryEntry.id,
    session: buildSessionSnapshot(updatedSession),
    sources: {
      anthropic: anthropicResult,
      openai: openaiResult,
    },
  }
}

function buildFallbackPrompt({ prompt, context, session, memorySnippets }) {
  const sections = [
    'You are the cloud fallback executor for phase 2.',
    'The local Llama action model has already tried and shown low confidence or failed.',
    'Use the stored plan as the source of truth and keep the response implementation-oriented.',
    'Return concise markdown only with sections for Summary, Files to Touch, Commands, Risks, and Validation.',
    '',
    `Task ID: ${session.taskId}`,
    `Plan goal: ${session.goal || 'unknown'}`,
    '',
    'Stored plan:',
    session.planText || 'No plan text stored yet.',
  ]

  if (memorySnippets.length) {
    sections.push('', 'Relevant memory:')
    for (const snippet of memorySnippets) {
      sections.push(`- ${snippet.summary || snippet.response.slice(0, 180)}`)
    }
  }

  if (context) {
    sections.push('', 'Extra context:', context)
  }

  sections.push('', `User action request: ${prompt}`)
  return sections.join('\n')
}

async function handleActionFallback({ prompt, context = '', session, memorySnippets }) {
  const fallbackPrompt = buildFallbackPrompt({ prompt, context, session, memorySnippets })
  const openaiPromise = OPENAI_API_KEY
    ? callOpenAI({
        model: OPENAI_MINI_MODEL,
        prompt: fallbackPrompt,
        instructions:
          'You are the cheap fallback coding assistant for an AI workflow. Stay concise, actionable, and implementation-oriented.',
        reasoningEffort: 'low',
        maxOutputTokens: 3500,
      })
    : Promise.resolve(null)

  const anthropicPromise = ANTHROPIC_API_KEY
    ? callAnthropic({
        model: ANTHROPIC_HAIKU_MODEL,
        system:
          'You are the fast fallback coding assistant for an AI workflow. Stay concise, actionable, and implementation-oriented.',
        prompt: fallbackPrompt,
        maxTokens: 3500,
      })
    : Promise.resolve(null)

  const [openaiResult, anthropicResult] = await Promise.all([openaiPromise, anthropicPromise])

  if (!openaiResult && !anthropicResult) {
    throw new Error('Phase 2 fallback requires at least OPENAI_API_KEY or ANTHROPIC_API_KEY.')
  }

  const notes = formatFallbackNotes(openaiResult, anthropicResult)
  const combinedResponse = mergeTextResults({
    title: 'Phase 2 Cloud Fallback',
    primary: openaiResult
      ? { ...openaiResult, label: `OpenAI ${OPENAI_MINI_MODEL}` }
      : anthropicResult
        ? { ...anthropicResult, label: `Claude ${ANTHROPIC_HAIKU_MODEL}` }
        : null,
    secondary:
      openaiResult && anthropicResult
        ? { ...anthropicResult, label: `Claude ${ANTHROPIC_HAIKU_MODEL}` }
        : null,
    notes,
  })

  const models = []
  if (openaiResult) {
    models.push({ provider: openaiResult.provider, model: openaiResult.model })
  }
  if (anthropicResult) {
    models.push({ provider: anthropicResult.provider, model: anthropicResult.model })
  }

  return {
    response: combinedResponse,
    provider: openaiResult && anthropicResult ? 'openai+anthropic' : openaiResult ? 'openai' : 'anthropic',
    model:
      openaiResult && anthropicResult
        ? `${OPENAI_MINI_MODEL} + ${ANTHROPIC_HAIKU_MODEL}`
        : openaiResult
          ? OPENAI_MINI_MODEL
          : ANTHROPIC_HAIKU_MODEL,
    strategy: 'phase-2-cloud-fallback',
    models,
    sources: {
      openai: openaiResult,
      anthropic: anthropicResult,
    },
  }
}

async function handleActionPhase({ prompt, context = '', taskId = '' }) {
  if (!taskId) {
    throw new Error('Phase 2 requires taskId from the plan phase.')
  }

  const store = await readStore()
  const session = findSession(store, taskId)
  if (!session || !session.planText) {
    throw new Error('Phase 2 requires a stored plan. Run phase 1 first.')
  }

  const memorySnippets = getRelevantMemory(store, prompt, taskId, 4)
  const actionPrompt = buildActionPrompt({
    prompt,
    context,
    session,
    memorySnippets,
  })

  let localResult = null
  let localError = null
  try {
    localResult = await callOllama({
      model: OLLAMA_ACTION_MODEL,
      prompt: actionPrompt,
    })
  } catch (error) {
    localError = error
  }

  let finalResult = localResult
  let strategy = 'phase-2-local-llama'
  let fallbackResult = null

  const shouldFallback =
    !localResult ||
    !localResult.response ||
    LOW_CONFIDENCE_PATTERN.test(localResult.response) ||
    localResult.response.length < 80

  if (shouldFallback) {
    try {
      fallbackResult = await handleActionFallback({
        prompt,
        context,
        session,
        memorySnippets,
      })

      finalResult = {
        ...fallbackResult,
        localResult,
      }
      strategy = 'phase-2-cloud-fallback'
    } catch (fallbackError) {
      if (!localResult) {
        throw localError || fallbackError
      }

      fastify.log.warn(
        { err: fallbackError },
        'Phase 2 cloud fallback failed, returning the local Ollama result'
      )

      strategy = 'phase-2-local-llama-degraded'
      finalResult = localResult
    }
  }

  const models = [
    localResult
      ? { provider: localResult.provider, model: localResult.model, role: 'primary-local' }
      : { provider: 'ollama', model: OLLAMA_ACTION_MODEL, role: 'primary-local' },
  ]

  if (fallbackResult) {
    for (const model of fallbackResult.models) {
      models.push({ ...model, role: 'fallback' })
    }
  }

  const responseText = fallbackResult ? fallbackResult.response : localResult?.response || ''

  const memoryEntry = await persistMemoryAndTraining({
    taskId,
    phase: 'action',
    prompt,
    response: responseText,
    models,
    strategy,
    context,
    summary: responseText.slice(0, 800),
  })

  const updatedSession = await saveSessionAction({
    taskId,
    prompt,
    response: responseText,
    models,
    strategy,
    entryId: memoryEntry.id,
  })

  return {
    phase: 'action',
    taskId,
    provider: finalResult?.provider || 'ollama',
    model: finalResult?.model || OLLAMA_ACTION_MODEL,
    strategy,
    response: responseText,
    memoryId: memoryEntry.id,
    session: buildSessionSnapshot(updatedSession),
    sources: {
      local: localResult,
      fallback: fallbackResult,
    },
  }
}

async function handleWorkflowRequest({ phase, prompt, taskId = '', context = '' }) {
  const normalizedPhase = normalizePhase(phase)

  if (!normalizedPhase) {
    return null
  }

  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required for phase-based AI requests.')
  }

  const normalizedPrompt = String(prompt).trim()
  const normalizedContext = String(context || '').trim()

  if (normalizedPhase === 'plan') {
    return handlePlanPhase({
      prompt: normalizedPrompt,
      context: normalizedContext,
      taskId: String(taskId || '').trim(),
    })
  }

  if (normalizedPhase === 'intermediate') {
    return handleIntermediatePhase({
      prompt: normalizedPrompt,
      context: normalizedContext,
      taskId: String(taskId || '').trim(),
    })
  }

  if (normalizedPhase === 'action') {
    return handleActionPhase({
      prompt: normalizedPrompt,
      context: normalizedContext,
      taskId: String(taskId || '').trim(),
    })
  }

  return null
}

async function getTaskSnapshot(taskId) {
  const store = await readStore()
  const session = findSession(store, taskId)
  if (!session) {
    return null
  }

  const entryIds = []
  if (session.planEntryId) {
    entryIds.push(session.planEntryId)
  }
  if (Array.isArray(session.intermediateEntryIds)) {
    entryIds.push(...session.intermediateEntryIds)
  }
  if (Array.isArray(session.actionEntryIds)) {
    entryIds.push(...session.actionEntryIds)
  }

  const entries = entryIds
    .map((id) => findMemoryById(store, id))
    .filter(Boolean)

  return {
    session: buildSessionSnapshot(session),
    entries,
  }
}

function getWorkflowRegistry() {
  return buildModelRegistry()
}

function getWorkflowHealth() {
  return buildHealth()
}

module.exports = {
  getTaskSnapshot,
  getWorkflowHealth,
  getWorkflowRegistry,
  handleWorkflowRequest,
}
