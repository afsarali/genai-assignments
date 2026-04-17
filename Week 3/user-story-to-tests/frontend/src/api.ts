import {
  GenerateRequest,
  GenerateResponse,
  JiraValidateResponse,
  JiraProject,
  JiraPushSummary,
  JiraPushRequest,
  JiraStoriesQuery,
  JiraStoriesResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8091/api'

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => ({ error: fallback }))
  const raw = payload?.error || fallback

  if (response.status === 401) {
    return 'Authentication failed. Please verify your JIRA/Groq credentials.'
  }
  if (response.status === 403) {
    return 'Access denied. Please verify your JIRA project permissions.'
  }
  return raw
}

async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs: number = 30000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function generateTests(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/generate-tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, 'Failed to generate test cases'))
    }

    const data: GenerateResponse = await response.json()
    return data
  } catch (error) {
    console.error('Error generating tests:', error)
    throw error instanceof Error ? error : new Error('Unknown error occurred')
  }
}

export async function validateJiraConnection(): Promise<JiraValidateResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/jira/validate`)
  const data = await response.json()
  return data
}

export async function getJiraProjects(): Promise<JiraProject[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/jira/projects`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to fetch JIRA projects'))
  }
  const data = await response.json()
  return data.projects
}

export async function getJiraIssueTypes(projectKey: string): Promise<string[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/jira/issue-types/${encodeURIComponent(projectKey)}`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to fetch issue types'))
  }
  const data = await response.json()
  return data.issueTypes
}

export async function pushToJira(request: JiraPushRequest): Promise<JiraPushSummary> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/jira/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to push test cases to JIRA'))
  }
  return response.json()
}

export async function getJiraStories(query: JiraStoriesQuery = {}): Promise<JiraStoriesResponse> {
  const params = new URLSearchParams()

  if (query.projectKey?.trim()) params.set('projectKey', query.projectKey.trim())
  if (query.issueTypes && query.issueTypes.length > 0) params.set('issueTypes', query.issueTypes.join(','))
  if (query.searchText?.trim()) params.set('searchText', query.searchText.trim())
  if (typeof query.startAt === 'number') params.set('startAt', String(query.startAt))
  if (typeof query.maxResults === 'number') params.set('maxResults', String(query.maxResults))

  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await fetchWithTimeout(`${API_BASE_URL}/jira/stories${suffix}`)

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to fetch JIRA stories'))
  }

  return response.json()
}
