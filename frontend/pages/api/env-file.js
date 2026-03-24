import fs from 'fs'
import path from 'path'

const ENV_ROOT = path.join(process.cwd(), 'environments')

export default function handler(req, res) {
  const requested = Array.isArray(req.query.path) ? req.query.path[0] : req.query.path
  if (!requested) {
    return res.status(400).json({ error: 'path query is required' })
  }

  const normalized = path.normalize(requested).replace(/\\/g, '/')
  if (normalized.includes('..')) {
    return res.status(400).json({ error: 'invalid path' })
  }

  const absolutePath = path.join(ENV_ROOT, normalized)
  if (!absolutePath.startsWith(ENV_ROOT)) {
    return res.status(400).json({ error: 'invalid path' })
  }

  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ error: 'file not found' })
  }

  const stat = fs.statSync(absolutePath)
  if (stat.isDirectory()) {
    return res.status(400).json({ error: 'path is a directory' })
  }

  const content = fs.readFileSync(absolutePath, 'utf8')
  res.status(200).send(content)
}
