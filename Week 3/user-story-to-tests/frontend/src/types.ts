export interface GenerateRequest {
  storyTitle: string
  acceptanceCriteria: string
  description?: string
  additionalInfo?: string
}

export interface TestCase {
  id: string
  title: string
  priority: string
  steps: string[]
  testData?: string
  expectedResult: string
  category: string
}

export interface GenerateResponse {
  cases: TestCase[]
  model?: string
  promptTokens: number
  completionTokens: number
}

// JIRA Integration types
export interface JiraProject {
  id: string
  key: string
  name: string
}

export interface JiraPushResult {
  testCaseId: string
  jiraKey: string
  jiraUrl: string
  status: 'success' | 'failed'
  error?: string
}

export interface JiraPushSummary {
  totalRequested: number
  totalCreated: number
  totalFailed: number
  results: JiraPushResult[]
  projectKey: string
}

export interface JiraValidateResponse {
  connected: boolean
  user?: { accountId: string; displayName: string; email: string }
  error?: string
}

export interface JiraPushRequest {
  projectKey: string
  storyTitle: string
  issueType?: string
  testCases: TestCase[]
}

export interface JiraStory {
  storyKey: string
  title: string
  description: string
  acceptanceCriteria: string
  status: string
  assignee: string
}

export interface JiraStoriesResponse {
  projectKey: string
  issueTypes: string[]
  total: number
  startAt: number
  maxResults: number
  stories: JiraStory[]
}

export interface JiraStoriesQuery {
  projectKey?: string
  issueTypes?: string[]
  searchText?: string
  startAt?: number
  maxResults?: number
}
