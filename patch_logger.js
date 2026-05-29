const fs = require('fs')
let content = fs.readFileSync('app/api/resolve-scope/route.ts', 'utf8')
content = content.replace('return NextResponse.json({ projectId, projectName, experimentId, experimentName })',
'console.log("RESOLVE SCOPE:", { path, type, id, projectId, projectName, experimentId, experimentName })\n  return NextResponse.json({ projectId, projectName, experimentId, experimentName })')
fs.writeFileSync('app/api/resolve-scope/route.ts', content)
