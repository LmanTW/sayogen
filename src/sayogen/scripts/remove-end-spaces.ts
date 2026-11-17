import path from 'path'
import fs from 'fs'

let entries: string[] = []

const acceptedExtensions: string[] = [
  '.py',
  '.ts', '.tsx',
  '.html', '.css',
  '.md', '.json', '.toml'
]

const acceptedNames: string[] = [
  '.gitignore',
  '.gitattributes',

  'LICENSE'
]

for (const entry of fs.readdirSync(path.resolve(__dirname, '../../'), { withFileTypes: true })) {
  const filepath = path.join(entry.parentPath, entry.name)

  if (acceptedNames.includes(entry.name) || (entry.name[0] !== '.' && acceptedExtensions.includes(path.extname(entry.name)) && entry.isFile())) {
    entries.push(filepath)
  }
}

for (const entry of fs.readdirSync(path.resolve(__dirname, '../../src'), { recursive: true, withFileTypes: true })) {
  const filepath = path.join(entry.parentPath, entry.name)

  if (acceptedNames.includes(entry.name) || (entry.name[0] !== '.' && acceptedExtensions.includes(path.extname(entry.name)) && entry.isFile())) {
    entries.push(filepath)
  }
}

for (const entry of fs.readdirSync(path.resolve(__dirname, '../../docs'), { recursive: true, withFileTypes: true })) {
  const filepath = path.join(entry.parentPath, entry.name)

  if (acceptedNames.includes(entry.name) || (entry.name[0] !== '.' && acceptedExtensions.includes(path.extname(entry.name)) && entry.isFile())) {
    entries.push(filepath)
  }
}

const files = new Set<string>()

for (const entry of entries) {
  const lines = fs.readFileSync(entry, 'utf8').split('\n')

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].endsWith(' ')) {
      lines[i] = lines[i].trimEnd()

      files.add(entry)
    }
  }

  if (files.has(entry)) {
    fs.writeFileSync(entry, lines.join('\n'))
  }
}

console.log(Array.from(files).join('\n'))
