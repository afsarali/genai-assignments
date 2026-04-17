import axios, { AxiosInstance } from 'axios'
import { TestCase } from '../schemas'

export interface JiraProject {
  id: string
  key: string
  name: string
}

export interface JiraIssueCreated {
  id: string
  key: string
  self: string
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

export interface JiraStory {
  storyKey: string
  title: string
  description: string
  acceptanceCriteria: string
  status: string
  assignee: string
}

export interface JiraStoriesResponse {
  total: number
  startAt: number
  maxResults: number
  stories: JiraStory[]
}

export class JiraClient {
  private client: AxiosInstance
  private baseUrl: string

  constructor() {
    const email = process.env.JIRA_EMAIL
    const apiToken = process.env.JIRA_API_TOKEN
    this.baseUrl = process.env.JIRA_BASE_URL || 'https://afsar19ali.atlassian.net'

    if (!email || !apiToken) {
      throw new Error('JIRA_EMAIL and JIRA_API_TOKEN environment variables are required')
    }

    const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64')

    this.client = axios.create({
      baseURL: `${this.baseUrl}/rest/api/3`,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    })
  }

  /** Validate connection by fetching the authenticated user */
  async validateConnection(): Promise<{ accountId: string; displayName: string; email: string }> {
    const response = await this.client.get('/myself')
    return {
      accountId: response.data.accountId,
      displayName: response.data.displayName,
      email: response.data.emailAddress,
    }
  }

  /** List all accessible projects */
  async getProjects(): Promise<JiraProject[]> {
    const response = await this.client.get('/project/search', {
      params: { maxResults: 50, orderBy: 'name' },
    })
    return response.data.values.map((p: any) => ({
      id: p.id,
      key: p.key,
      name: p.name,
    }))
  }

  /** Get available issue types for a project */
  async getIssueTypes(projectKey: string): Promise<string[]> {
    const response = await this.client.get(`/project/${projectKey}`)
    return response.data.issueTypes?.map((t: any) => t.name) ?? []
  }

  /** Convert Atlassian Document Format (ADF) to readable plain text. */
  private adfToText(node: any): string {
    if (!node) return ''
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map((item) => this.adfToText(item)).join('')

    const type = node.type as string | undefined
    const content = Array.isArray(node.content) ? node.content : []

    switch (type) {
      case 'doc':
        return content.map((item) => this.adfToText(item)).join('')
      case 'text':
        return node.text ?? ''
      case 'hardBreak':
        return '\n'
      case 'mention':
        return node.attrs?.text ?? node.attrs?.id ?? ''
      case 'emoji':
        return node.attrs?.text ?? node.attrs?.shortName ?? ''
      case 'inlineCard':
      case 'blockCard':
        return node.attrs?.url ?? ''
      case 'paragraph':
      case 'heading':
      case 'blockquote':
      case 'panel': {
        const line = content.map((item) => this.adfToText(item)).join('')
        return line.trim() ? `${line}\n` : '\n'
      }
      case 'codeBlock': {
        const block = content.map((item) => this.adfToText(item)).join('')
        return block.trim() ? `${block}\n` : ''
      }
      case 'bulletList':
        return content.map((item) => this.adfToText(item)).join('')
      case 'orderedList': {
        let index = 1
        return content
          .map((item) => {
            const raw = this.adfToText(item).trim()
            if (!raw) return ''
            const value = `${index}. ${raw}\n`
            index += 1
            return value
          })
          .join('')
      }
      case 'listItem': {
        const item = content.map((child) => this.adfToText(child)).join('').trim()
        return item ? `- ${item}\n` : ''
      }
      case 'table':
        return content.map((item) => this.adfToText(item)).join('')
      case 'tableRow': {
        const row = content
          .map((cell: any) => this.adfToText(cell).replace(/\n+/g, ' ').trim())
          .filter(Boolean)
          .join(' | ')
        return row ? `${row}\n` : ''
      }
      case 'tableHeader':
      case 'tableCell':
        return content.map((item) => this.adfToText(item)).join('')
      default:
        return content.map((item) => this.adfToText(item)).join('')
    }
  }

  private normalizeExtractedText(text: string): string {
    return text
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private toPlainText(value: any): string {
    if (!value) return ''
    if (typeof value === 'string') return this.normalizeExtractedText(value)
    if (typeof value === 'object') return this.normalizeExtractedText(this.adfToText(value))
    return this.normalizeExtractedText(String(value))
  }

  private normalizeAcceptanceCriteriaText(text: string): string {
    if (!text) return ''

    // If AC is stored as one long line with numbered clauses, split it for readability.
    if (!text.includes('\n') && /\b1\.\s/.test(text) && /\b2\.\s/.test(text)) {
      return text.replace(/\s(?=\d+\.\s)/g, '\n').trim()
    }

    return text
  }

  private extractAcceptanceCriteria(fields: any): string {
    const customFieldValue = this.toPlainText(fields?.customfield_10041)
    if (customFieldValue) {
      return this.normalizeAcceptanceCriteriaText(customFieldValue)
    }

    const descriptionText = this.toPlainText(fields?.description)
    if (!descriptionText) return ''

    const fallbackMatch = descriptionText.match(
      /(?:^|\n)(?:acceptance\s*criteria|acceptance\s*criterion|acceptance)\s*[:\-]\s*([\s\S]*)$/i
    )

    const fallback = fallbackMatch?.[1]?.trim() ?? ''
    return this.normalizeAcceptanceCriteriaText(fallback)
  }

  private sanitizeIssueTypes(issueTypes: string[]): string[] {
    return issueTypes
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => /^[A-Za-z0-9 _-]+$/.test(t))
  }

  private escapeJqlString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  }

  /**
   * Fetch issues for a project and normalize them into story-like payload for UI consumption.
   */
  async getStories(params: {
    projectKey: string
    issueTypes?: string[]
    searchText?: string
    startAt?: number
    maxResults?: number
  }): Promise<JiraStoriesResponse> {
    const {
      projectKey,
      issueTypes = ['Task', 'Story'],
      searchText,
      startAt = 0,
      maxResults = 20,
    } = params

    const types = this.sanitizeIssueTypes(issueTypes)
    const issueTypeClause = types.length > 0 ? ` AND issuetype in (${types.map((t) => `"${t}"`).join(', ')})` : ''
    const searchClause = searchText?.trim()
      ? ` AND (summary ~ "${this.escapeJqlString(searchText.trim())}" OR key ~ "${this.escapeJqlString(searchText.trim())}")`
      : ''
    const jql = `project = ${projectKey}${issueTypeClause}${searchClause} ORDER BY updated DESC`

    const response = await this.client.get('/search/jql', {
      params: {
        jql,
        startAt,
        maxResults,
        fields: 'summary,description,customfield_10041,status,assignee,issuetype',
      },
    })

    const issues = response.data.issues ?? []
    const stories: JiraStory[] = issues.map((issue: any) => {
      const f = issue.fields ?? {}
      return {
        storyKey: issue.key,
        title: f.summary ?? '',
        description: this.toPlainText(f.description),
        acceptanceCriteria: this.extractAcceptanceCriteria(f),
        status: f.status?.name ?? 'Unknown',
        assignee: f.assignee?.displayName ?? 'Unassigned',
      }
    })

    return {
      total: response.data.total ?? stories.length,
      startAt: response.data.startAt ?? startAt,
      maxResults: response.data.maxResults ?? maxResults,
      stories,
    }
  }

  /** Map test case priority to JIRA priority name */
  private mapPriority(priority: string): string {
    const map: Record<string, string> = {
      High: 'High',
      Medium: 'Medium',
      Low: 'Low',
    }
    return map[priority] ?? 'Medium'
  }

  /** Build Atlassian Document Format (ADF) description from a test case */
  private buildAdfDescription(testCase: TestCase, storyTitle: string): object {
    const stepsContent = testCase.steps.map((step, index) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `${index + 1}. ${step}` }],
        },
      ],
    }))

    return {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'User Story: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: storyTitle },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Category: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: testCase.category },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Test Steps:', marks: [{ type: 'strong' }] }],
        },
        {
          type: 'bulletList',
          content: stepsContent,
        },
        ...(testCase.testData
          ? [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Test Data: ', marks: [{ type: 'strong' }] },
                  { type: 'text', text: testCase.testData },
                ],
              },
            ]
          : []),
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Expected Result: ', marks: [{ type: 'strong' }] },
            { type: 'text', text: testCase.expectedResult },
          ],
        },
      ],
    }
  }

  /** Create a single JIRA issue from a test case */
  async createIssue(
    projectKey: string,
    testCase: TestCase,
    storyTitle: string,
    issueType: string = 'Task'
  ): Promise<JiraIssueCreated> {
    const payload = {
      fields: {
        project: { key: projectKey },
        summary: `[${testCase.id}] ${testCase.title}`,
        description: this.buildAdfDescription(testCase, storyTitle),
        issuetype: { name: issueType },
        priority: { name: this.mapPriority(testCase.priority) },
        labels: ['auto-generated', `category-${testCase.category.toLowerCase()}`],
      },
    }

    const response = await this.client.post('/issue', payload)
    return {
      id: response.data.id,
      key: response.data.key,
      self: response.data.self,
    }
  }

  /** Push all test cases to JIRA, returning a summary of results */
  async pushTestCases(
    projectKey: string,
    testCases: TestCase[],
    storyTitle: string,
    issueType: string = 'Task'
  ): Promise<JiraPushSummary> {
    const results: JiraPushResult[] = []

    for (const tc of testCases) {
      try {
        const issue = await this.createIssue(projectKey, tc, storyTitle, issueType)
        results.push({
          testCaseId: tc.id,
          jiraKey: issue.key,
          jiraUrl: `${this.baseUrl}/browse/${issue.key}`,
          status: 'success',
        })
      } catch (err: any) {
        const message =
          err?.response?.data?.errors
            ? JSON.stringify(err.response.data.errors)
            : err?.message ?? 'Unknown error'
        results.push({
          testCaseId: tc.id,
          jiraKey: '',
          jiraUrl: '',
          status: 'failed',
          error: message,
        })
      }
    }

    return {
      totalRequested: testCases.length,
      totalCreated: results.filter((r) => r.status === 'success').length,
      totalFailed: results.filter((r) => r.status === 'failed').length,
      results,
      projectKey,
    }
  }
}
