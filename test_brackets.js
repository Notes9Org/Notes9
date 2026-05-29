const fs = require('fs')
const content = fs.readFileSync('app/api/resolve-scope/route.ts', 'utf8')
const lines = content.split('\n')
let open = 0
for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  for (const char of line) {
    if (char === '{') open++
    if (char === '}') open--
  }
  console.log(`${String(i+1).padStart(2)}: ${open} ${line}`)
}
