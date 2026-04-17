import { Fragment, useMemo, useState } from 'react'
import { generateTests, getJiraStories } from './api'
import { GenerateRequest, GenerateResponse, JiraStory } from './types'
import { DownloadButtons } from './components/DownloadButtons'
import { JiraIntegration } from './components/JiraIntegration'
import './App.css'

type InputMode = 'manual' | 'jira'
type ExecutionStatus = 'Not Run' | 'Passed' | 'Failed' | 'Blocked'

interface GeneratedContext {
  sourceMode: InputMode
  storyKey?: string
  status?: string
  assignee?: string
  exportTitle: string
}

interface TraceabilityRecord {
  requirementRef: string
  executionStatus: ExecutionStatus
  defectId: string
  owner: string
}

const PAGE_SIZE = 25

function App() {
  const [formData, setFormData] = useState<GenerateRequest>({
    storyTitle: '',
    acceptanceCriteria: '',
    description: '',
    additionalInfo: '',
  })
  const [results, setResults] = useState<GenerateResponse | null>(null)
  const [generatedContext, setGeneratedContext] = useState<GeneratedContext | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('manual')

  const [jiraProjectKey, setJiraProjectKey] = useState('')
  const [jiraSearch, setJiraSearch] = useState('')
  const [jiraStories, setJiraStories] = useState<JiraStory[]>([])
  const [jiraLoading, setJiraLoading] = useState(false)
  const [jiraError, setJiraError] = useState<string | null>(null)
  const [jiraFetched, setJiraFetched] = useState(false)
  const [selectedJiraStory, setSelectedJiraStory] = useState<JiraStory | null>(null)

  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set())
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set())
  const [traceability, setTraceability] = useState<Record<string, TraceabilityRecord>>({})

  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [executionFilter, setExecutionFilter] = useState('All')
  const [bulkStatus, setBulkStatus] = useState<ExecutionStatus>('Not Run')
  const [currentPage, setCurrentPage] = useState(1)

  const requirementRefs = useMemo(() => {
    const cleaned = formData.acceptanceCriteria
      .split(/\n+/)
      .map((line) => line.trim())
      .flatMap((line) => line.split(/\s(?=\d+\.\s)/g).map((part) => part.trim()))
      .filter(Boolean)

    return cleaned.map((_, index) => `AC-${String(index + 1).padStart(2, '0')}`)
  }, [formData.acceptanceCriteria])

  const categories = useMemo(() => {
    if (!results) return ['All']
    return ['All', ...Array.from(new Set(results.cases.map((c) => c.category)))]
  }, [results])

  const priorities = useMemo(() => {
    if (!results) return ['All']
    return ['All', ...Array.from(new Set(results.cases.map((c) => c.priority)))]
  }, [results])

  const filteredCases = useMemo(() => {
    if (!results) return []

    return results.cases.filter((tc) => {
      const trace = traceability[tc.id]
      const matchesSearch =
        `${tc.id} ${tc.title} ${tc.expectedResult} ${trace?.defectId ?? ''} ${trace?.requirementRef ?? ''}`
          .toLowerCase()
          .includes(searchTerm.trim().toLowerCase())

      const matchesCategory = categoryFilter === 'All' || tc.category === categoryFilter
      const matchesPriority = priorityFilter === 'All' || tc.priority === priorityFilter
      const matchesExecution =
        executionFilter === 'All' || (trace?.executionStatus ?? 'Not Run') === executionFilter

      return matchesSearch && matchesCategory && matchesPriority && matchesExecution
    })
  }, [results, traceability, searchTerm, categoryFilter, priorityFilter, executionFilter])

  const pagedCases = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredCases.slice(start, start + PAGE_SIZE)
  }, [filteredCases, currentPage])

  const pageCount = Math.max(1, Math.ceil(filteredCases.length / PAGE_SIZE))

  const executionMetrics = useMemo(() => {
    const all = results?.cases ?? []
    const total = all.length
    const passed = all.filter((tc) => traceability[tc.id]?.executionStatus === 'Passed').length
    const failed = all.filter((tc) => traceability[tc.id]?.executionStatus === 'Failed').length
    const blocked = all.filter((tc) => traceability[tc.id]?.executionStatus === 'Blocked').length
    const notRun = total - passed - failed - blocked
    return { total, passed, failed, blocked, notRun }
  }, [results, traceability])

  const handleInputChange = (field: keyof GenerateRequest, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const loadJiraStories = async () => {
    setJiraLoading(true)
    setJiraError(null)
    try {
      const response = await getJiraStories({
        projectKey: jiraProjectKey || undefined,
        issueTypes: ['Task', 'Story'],
        searchText: jiraSearch || undefined,
        startAt: 0,
        maxResults: 50,
      })
      setJiraStories(response.stories)
      setJiraFetched(true)
    } catch (err) {
      setJiraError(err instanceof Error ? err.message : 'Failed to fetch JIRA stories')
      setJiraStories([])
    } finally {
      setJiraLoading(false)
    }
  }

  const handleSwitchMode = (mode: InputMode) => {
    setInputMode(mode)
    if (mode === 'jira' && !jiraFetched) {
      loadJiraStories()
    }
    if (mode === 'manual') {
      setSelectedJiraStory(null)
    }
  }

  const handleSelectJiraStory = (story: JiraStory) => {
    setSelectedJiraStory(story)
    setFormData((prev) => ({
      ...prev,
      storyTitle: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria,
    }))
    setError(null)
  }

  const initializeTraceability = (response: GenerateResponse) => {
    const next: Record<string, TraceabilityRecord> = {}
    response.cases.forEach((tc, index) => {
      const ref = requirementRefs[index % Math.max(requirementRefs.length, 1)] ?? 'AC-NA'
      next[tc.id] = {
        requirementRef: ref,
        executionStatus: 'Not Run',
        defectId: '',
        owner: 'QA Engineer',
      }
    })
    setTraceability(next)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    const title = formData.storyTitle.trim()
    const ac = formData.acceptanceCriteria.trim()
    if (!title || !ac) {
      setError('Story title and acceptance criteria are required.')
      return
    }
    if (title.length < 3) {
      setError('Story title should be at least 3 characters long.')
      return
    }
    if (ac.length < 10) {
      setError('Acceptance criteria should be at least 10 characters long.')
      return
    }

    setError(null)
    setIsLoading(true)

    const context: GeneratedContext = {
      sourceMode: inputMode,
      storyKey: selectedJiraStory?.storyKey,
      status: selectedJiraStory?.status,
      assignee: selectedJiraStory?.assignee,
      exportTitle:
        inputMode === 'jira' && selectedJiraStory?.storyKey
          ? `${selectedJiraStory.storyKey}_${title}`
          : title,
    }

    try {
      const response = await generateTests(formData)
      setResults(response)
      setGeneratedContext(context)
      initializeTraceability(response)
      setExpandedTestCases(new Set())
      setSelectedCaseIds(new Set())
      setCurrentPage(1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests')
    } finally {
      setIsLoading(false)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedTestCases((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelected = (id: string) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateTrace = (id: string, patch: Partial<TraceabilityRecord>) => {
    setTraceability((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        ...patch,
      },
    }))
  }

  const applyBulkStatus = () => {
    if (selectedCaseIds.size === 0) return
    const selected = Array.from(selectedCaseIds)
    setTraceability((prev) => {
      const next = { ...prev }
      selected.forEach((id) => {
        if (next[id]) next[id] = { ...next[id], executionStatus: bulkStatus }
      })
      return next
    })
  }

  return (
    <div className="app-shell">
      <div className="workspace">
        <header className="hero">
          <div>
            <h1>QA Engineering Command Center</h1>
            <p>
              Requirement-to-test traceability workspace for test engineers, QA leads, and automation architects.
            </p>
          </div>
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Traceable Tests</div>
              <div className="kpi-value">{executionMetrics.total}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Failed</div>
              <div className="kpi-value kpi-danger">{executionMetrics.failed}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Not Run</div>
              <div className="kpi-value kpi-warn">{executionMetrics.notRun}</div>
            </div>
          </div>
        </header>

        <div className="top-grid">
          <section className="panel">
            <div className="panel-head">
              <h2>Story Intake</h2>
              <div className="mode-switch">
                <button
                  type="button"
                  className={inputMode === 'manual' ? 'active' : ''}
                  onClick={() => handleSwitchMode('manual')}
                >
                  Manual
                </button>
                <button
                  type="button"
                  className={inputMode === 'jira' ? 'active' : ''}
                  onClick={() => handleSwitchMode('jira')}
                >
                  JIRA Import
                </button>
              </div>
            </div>
            <div className="source-body">
              {inputMode === 'jira' && (
                <div className="input-stack">
                  <div className="control">
                    <label htmlFor="jiraProjectKey">Project Key</label>
                    <input
                      id="jiraProjectKey"
                      value={jiraProjectKey}
                      onChange={(e) => setJiraProjectKey(e.target.value)}
                      placeholder="Optional (defaults from backend)"
                    />
                  </div>
                  <div className="control">
                    <label htmlFor="jiraSearch">Search Story</label>
                    <input
                      id="jiraSearch"
                      value={jiraSearch}
                      onChange={(e) => setJiraSearch(e.target.value)}
                      placeholder="Search by key/title"
                    />
                  </div>
                  <div className="form-actions">
                    <button className="primary-btn" type="button" onClick={loadJiraStories} disabled={jiraLoading}>
                      {jiraLoading ? 'Fetching...' : 'Fetch Stories'}
                    </button>
                    {jiraError && (
                      <button className="warn-btn" type="button" onClick={loadJiraStories}>
                        Retry
                      </button>
                    )}
                  </div>
                  {jiraError && <div className="alert error">{jiraError}</div>}
                  <div className="story-list">
                    {jiraStories.length === 0 && !jiraLoading && (
                      <div className="story-row">
                        <div className="story-meta">
                          {jiraFetched ? 'No matching stories for current filters.' : 'Fetch stories to begin import.'}
                        </div>
                      </div>
                    )}
                    {jiraStories.map((story) => (
                      <div
                        key={story.storyKey}
                        className={`story-row ${selectedJiraStory?.storyKey === story.storyKey ? 'active' : ''}`}
                      >
                        <div>
                          <div className="story-key">{story.storyKey}</div>
                          <div className="story-meta">{story.status}</div>
                        </div>
                        <div className="story-title">{story.title}</div>
                        <button className="ghost-btn" type="button" onClick={() => handleSelectJiraStory(story)}>
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inputMode === 'manual' && (
                <p className="story-meta">
                  Manual mode is active. Paste any requirement details and generate immediately.
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Requirement Authoring</h2>
              {selectedJiraStory && (
                <div className="badge">
                  Imported {selectedJiraStory.storyKey}
                </div>
              )}
            </div>
            <form className="form-body input-stack" onSubmit={handleSubmit}>
              <div className="control">
                <label htmlFor="storyTitle">Story Title</label>
                <input
                  id="storyTitle"
                  value={formData.storyTitle}
                  onChange={(e) => handleInputChange('storyTitle', e.target.value)}
                  placeholder="Enter feature or requirement title"
                />
              </div>
              <div className="control">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Add business flow, domain constraints, and scope"
                />
              </div>
              <div className="control">
                <label htmlFor="acceptanceCriteria">Acceptance Criteria</label>
                <textarea
                  id="acceptanceCriteria"
                  value={formData.acceptanceCriteria}
                  onChange={(e) => handleInputChange('acceptanceCriteria', e.target.value)}
                  placeholder="One or more testable criteria"
                />
              </div>
              <div className="control">
                <label htmlFor="additionalInfo">Additional Engineering Context</label>
                <textarea
                  id="additionalInfo"
                  value={formData.additionalInfo}
                  onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
                  placeholder="Dependencies, environments, known risks"
                />
              </div>
              <div className="form-actions">
                <button className="primary-btn" type="submit" disabled={isLoading}>
                  {isLoading ? 'Generating...' : 'Generate Test Cases'}
                </button>
                <button className="ghost-btn" type="button" onClick={() => setFormData({ storyTitle: '', acceptanceCriteria: '', description: '', additionalInfo: '' })}>
                  Clear
                </button>
              </div>
              {error && <div className="alert error">{error}</div>}
            </form>
          </section>
        </div>

        {results && (
          <section className="panel panel-offset-top">
            <div className="panel-head">
              <h3>Traceability & Review Workspace</h3>
              {generatedContext && (
                <div className="badge">
                  {generatedContext.sourceMode === 'jira' ? 'JIRA Source' : 'Manual Source'}
                  {generatedContext.storyKey ? ` ${generatedContext.storyKey}` : ''}
                </div>
              )}
            </div>
            <div className="results-body">
              <div className="metrics-strip">
                <div className="metric-pill"><span>Total</span><b>{executionMetrics.total}</b></div>
                <div className="metric-pill"><span>Passed</span><b>{executionMetrics.passed}</b></div>
                <div className="metric-pill"><span>Failed</span><b>{executionMetrics.failed}</b></div>
                <div className="metric-pill"><span>Blocked</span><b>{executionMetrics.blocked}</b></div>
                <div className="metric-pill"><span>Not Run</span><b>{executionMetrics.notRun}</b></div>
              </div>

              <div className="results-toolbar">
                <div className="results-filters">
                  <input
                    placeholder="Search ID, title, defect, requirement"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setCurrentPage(1)
                    }}
                  />
                  <select title="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    {categories.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select title="Filter by priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                    {priorities.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <select title="Filter by execution status" value={executionFilter} onChange={(e) => setExecutionFilter(e.target.value)}>
                    {['All', 'Not Run', 'Passed', 'Failed', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>

                <div className="bulk-actions">
                  <span>{selectedCaseIds.size} selected</span>
                  <select title="Bulk execution status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ExecutionStatus)}>
                    {['Not Run', 'Passed', 'Failed', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                  <button className="ghost-btn" type="button" onClick={applyBulkStatus}>Apply</button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="col-select"></th>
                      <th className="col-case-id">Case ID</th>
                      <th className="col-title">Title / Requirement</th>
                      <th className="col-category">Category</th>
                      <th className="col-priority">Priority</th>
                      <th className="col-execution">Execution</th>
                      <th className="col-defect">Defect</th>
                      <th>Expected Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedCases.map((tc) => {
                      const trace = traceability[tc.id]
                      return (
                        <Fragment key={tc.id}>
                          <tr>
                            <td>
                              <input
                                title="Select test case"
                                type="checkbox"
                                checked={selectedCaseIds.has(tc.id)}
                                onChange={() => toggleSelected(tc.id)}
                              />
                            </td>
                            <td>
                              <button className="expand-btn" type="button" onClick={() => toggleExpanded(tc.id)}>
                                {expandedTestCases.has(tc.id) ? 'v' : '>'} {tc.id}
                              </button>
                            </td>
                            <td className="cell-title">
                              <span>{tc.title}</span>
                              <span className="trace-chip">{trace?.requirementRef ?? 'AC-NA'}</span>
                            </td>
                            <td>{tc.category}</td>
                            <td>
                              <span className={`priority-tag priority-${tc.priority.toLowerCase()}`}>
                                {tc.priority}
                              </span>
                            </td>
                            <td>
                              <select
                                title="Execution status"
                                value={trace?.executionStatus ?? 'Not Run'}
                                onChange={(e) => updateTrace(tc.id, { executionStatus: e.target.value as ExecutionStatus })}
                              >
                                {['Not Run', 'Passed', 'Failed', 'Blocked'].map((item) => <option key={item}>{item}</option>)}
                              </select>
                            </td>
                            <td>
                              <input
                                value={trace?.defectId ?? ''}
                                onChange={(e) => updateTrace(tc.id, { defectId: e.target.value })}
                                placeholder="e.g. DEF-221"
                              />
                            </td>
                            <td>{tc.expectedResult}</td>
                          </tr>
                          {expandedTestCases.has(tc.id) && (
                            <tr>
                              <td colSpan={8}>
                                <div className="steps-panel">
                                  <strong>Execution Steps</strong>
                                  <ol>
                                    {tc.steps.map((step, index) => (
                                      <li key={`${tc.id}-${index}`}>{step}</li>
                                    ))}
                                  </ol>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pagination">
                <span>
                  Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredCases.length)}-
                  {Math.min(currentPage * PAGE_SIZE, filteredCases.length)} of {filteredCases.length}
                </span>
                <div className="actions">
                  <button className="ghost-btn" type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </button>
                  <button className="ghost-btn" type="button" onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}>
                    Next
                  </button>
                </div>
              </div>

              <div className="bottom-grid">
                <DownloadButtons
                  results={results}
                  storyTitle={generatedContext?.exportTitle || formData.storyTitle}
                />
                <JiraIntegration
                  testCases={results?.cases ?? []}
                  storyTitle={generatedContext?.exportTitle || formData.storyTitle}
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

export default App