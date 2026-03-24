import fs from 'fs'
import path from 'path'

const ENV_ROOT = path.join(process.cwd(), 'environments')

function safeEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
  } catch (error) {
    return []
  }
}

function buildTree(dirPath) {
  const entries = safeEntries(dirPath)
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => {
      const absolutePath = path.join(dirPath, entry.name)
      const relativePath = path.relative(ENV_ROOT, absolutePath).replace(/\\/g, '/')

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relativePath,
          type: 'folder',
          children: buildTree(absolutePath),
        }
      }

      return {
        name: entry.name,
        path: relativePath,
        type: 'file',
      }
    })
}

export default function handler(req, res) {
  if (!fs.existsSync(ENV_ROOT)) {
    return res.status(200).json({ environments: [] })
  }

  const tree = buildTree(ENV_ROOT)
  res.status(200).json({ environments: tree })
}
