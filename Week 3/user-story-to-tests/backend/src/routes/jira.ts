import express from 'express'
import { z } from 'zod'
import { JiraClient } from '../jira/jiraClient'

export const jiraRouter = express.Router()

const StoriesQuerySchema = z.object({
  projectKey: z.string().optional(),
  issueTypes: z.string().optional(),
  searchText: z.string().optional(),
  startAt: z.coerce.number().int().min(0).default(0),
  maxResults: z.coerce.number().int().min(1).max(100).default(20),
})

/** GET /api/jira/validate — Check credentials and return user info */
jiraRouter.get('/validate', async (_req, res) => {
  try {
    const client = new JiraClient()
    const user = await client.validateConnection()
    res.json({ connected: true, user })
  } catch (err: any) {
    const statusCode = err?.response?.status
    const status = statusCode === 401 || statusCode === 403 ? statusCode : 502
    res.status(status).json({
      connected: false,
      error:
        status === 401
          ? 'Invalid JIRA credentials'
          : status === 403
            ? 'JIRA access denied for this account/project'
            : (err.message ?? 'Failed to connect to JIRA'),
    })
  }
})

/** GET /api/jira/projects — List accessible projects */
jiraRouter.get('/projects', async (_req, res) => {
  try {
    const client = new JiraClient()
    const projects = await client.getProjects()
    res.json({ projects })
  } catch (err: any) {
    const statusCode = err?.response?.status
    const status = statusCode === 401 || statusCode === 403 ? statusCode : 502
    res.status(status).json({
      error:
        status === 401
          ? 'Invalid JIRA credentials'
          : status === 403
            ? 'JIRA access denied for this account/project'
            : (err.message ?? 'Failed to fetch JIRA projects'),
    })
  }
})

/** GET /api/jira/issue-types/:projectKey — List issue types for a project */
jiraRouter.get('/issue-types/:projectKey', async (req, res) => {
  try {
    const { projectKey } = req.params
    const client = new JiraClient()
    const issueTypes = await client.getIssueTypes(projectKey)
    res.json({ issueTypes })
  } catch (err: any) {
    const statusCode = err?.response?.status
    const status = statusCode === 401 || statusCode === 403 ? statusCode : 502
    res.status(status).json({
      error:
        status === 401
          ? 'Invalid JIRA credentials'
          : status === 403
            ? 'JIRA access denied for this account/project'
            : (err.message ?? 'Failed to fetch issue types'),
    })
  }
})

/**
 * GET /api/jira/stories
 * Returns normalized issues (story payload) with pagination and optional text search.
 */
jiraRouter.get('/stories', async (req, res) => {
  const validation = StoriesQuerySchema.safeParse(req.query)
  if (!validation.success) {
    res.status(400).json({ error: `Validation error: ${validation.error.message}` })
    return
  }

  const { projectKey, issueTypes, searchText, startAt, maxResults } = validation.data
  const effectiveProjectKey = projectKey || process.env.JIRA_PROJECT_KEY

  if (!effectiveProjectKey) {
    res.status(400).json({ error: 'projectKey is required (query or JIRA_PROJECT_KEY env var)' })
    return
  }

  const parsedIssueTypes = issueTypes
    ? issueTypes.split(',').map((t) => t.trim()).filter(Boolean)
    : ['Task', 'Story']

  try {
    const client = new JiraClient()
    const response = await client.getStories({
      projectKey: effectiveProjectKey,
      issueTypes: parsedIssueTypes,
      searchText,
      startAt,
      maxResults,
    })

    res.json({
      projectKey: effectiveProjectKey,
      issueTypes: parsedIssueTypes,
      ...response,
    })
  } catch (err: any) {
    const status = err?.response?.status
    const code = status === 401 || status === 403 ? status : (typeof status === 'number' ? status : 502)
    res.status(code).json({
      error:
        code === 401
          ? 'Invalid JIRA credentials'
          : code === 403
            ? 'JIRA access denied for this account/project'
            : err?.response?.data?.errorMessages?.join(', ') || err.message || 'Failed to fetch JIRA stories',
    })
  }
})

const PushRequestSchema = z.object({
  projectKey: z.string().min(1, 'Project key is required'),
  storyTitle: z.string().min(1, 'Story title is required'),
  issueType: z.string().optional().default('Task'),
  testCases: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        priority: z.string(),
        steps: z.array(z.string()),
        testData: z.string().optional(),
        expectedResult: z.string(),
        category: z.string(),
      })
    )
    .min(1, 'At least one test case is required'),
})

/** POST /api/jira/push — Create JIRA issues from test cases */
jiraRouter.post('/push', async (req, res) => {
  const validation = PushRequestSchema.safeParse(req.body)
  if (!validation.success) {
    res.status(400).json({ error: `Validation error: ${validation.error.message}` })
    return
  }

  const { projectKey, storyTitle, issueType, testCases } = validation.data

  try {
    const client = new JiraClient()
    const summary = await client.pushTestCases(projectKey, testCases, storyTitle, issueType)
    res.json(summary)
  } catch (err: any) {
    const statusCode = err?.response?.status
    const status = statusCode === 401 || statusCode === 403 ? statusCode : 502
    res.status(status).json({
      error:
        status === 401
          ? 'Invalid JIRA credentials'
          : status === 403
            ? 'JIRA access denied for this account/project'
            : (err.message ?? 'Failed to push to JIRA'),
    })
  }
})
