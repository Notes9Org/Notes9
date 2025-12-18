// Simple test to verify mock Supabase client works
const { createMockClient } = require('./lib/supabase/mock-client.ts')

async function testMock() {
  console.log('Testing mock Supabase client...')
  
  const client = createMockClient()
  
  // Test auth
  const { data: { user } } = await client.auth.getUser()
  console.log('Mock user:', user)
  
  // Test projects query
  const { data: projects } = await client.from('projects').select('*')
  console.log('Mock projects:', projects)
  
  // Test count query
  const { count } = await client.from('projects').select('*', { count: 'exact', head: true })
  console.log('Mock project count:', count)
  
  console.log('Mock client test completed successfully!')
}

testMock().catch(console.error)