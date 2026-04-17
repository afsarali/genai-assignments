import { useState, useEffect } from 'react'
import { TestCase, JiraProject, JiraPushSummary } from '../types'
import { validateJiraConnection, getJiraProjects, getJiraIssueTypes, pushToJira } from '../api'

interface JiraIntegrationProps {
  testCases: TestCase[]
  storyTitle: string
}

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'error'
type PushStatus = 'idle' | 'pushing' | 'done' | 'error'

export function JiraIntegration({ testCases, storyTitle }: JiraIntegrationProps) {
  const [expanded, setExpanded] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [connectedUser, setConnectedUser] = useState<string>('')
  const [connectionError, setConnectionError] = useState<string>('')

  const [projects, setProjects] = useState<JiraProject[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [issueTypes, setIssueTypes] = useState<string[]>([])
  const [selectedIssueType, setSelectedIssueType] = useState<string>('Task')
  const [loadingProjects, setLoadingProjects] = useState(false)

  const [pushStatus, setPushStatus] = useState<PushStatus>('idle')
  const [pushSummary, setPushSummary] = useState<JiraPushSummary | null>(null)
  const [pushError, setPushError] = useState<string>('')

  const checkConnection = async () => {
    setConnectionStatus('checking')
    setConnectionError('')
    try {
      const result = await validateJiraConnection()
      if (result.connected && result.user) {
        setConnectionStatus('connected')
        setConnectedUser(result.user.displayName || result.user.email)
        fetchProjects()
      } else {
        setConnectionStatus('error')
        setConnectionError(result.error || 'Could not connect to JIRA')
      }
    } catch {
      setConnectionStatus('error')
      setConnectionError('Failed to reach backend. Is the server running?')
    }
  }

  const fetchProjects = async () => {
    setLoadingProjects(true)
    try {
      const list = await getJiraProjects()
      setProjects(list)
      if (list.length > 0) setSelectedProject(list[0].key)
    } catch {
      // non-fatal — user can still type project key manually
    } finally {
      setLoadingProjects(false)
    }
  }

  useEffect(() => {
    if (selectedProject && connectionStatus === 'connected') {
      getJiraIssueTypes(selectedProject)
        .then((types) => {
          setIssueTypes(types)
          if (types.includes('Task')) setSelectedIssueType('Task')
          else if (types.length > 0) setSelectedIssueType(types[0])
        })
        .catch(() => setIssueTypes([]))
    }
  }, [selectedProject, connectionStatus])

  const handlePush = async () => {
    if (!selectedProject) return
    setPushStatus('pushing')
    setPushError('')
    setPushSummary(null)
    try {
      const summary = await pushToJira({
        projectKey: selectedProject,
        storyTitle,
        issueType: selectedIssueType,
        testCases,
      })
      setPushSummary(summary)
      setPushStatus('done')
    } catch (err: any) {
      setPushError(err.message || 'Failed to push test cases to JIRA')
      setPushStatus('error')
    }
  }

  const statusColor: Record<ConnectionStatus, string> = {
    idle: '#666',
    checking: '#f39c12',
    connected: '#27ae60',
    error: '#e74c3c',
  }

  const statusLabel: Record<ConnectionStatus, string> = {
    idle: 'Not connected',
    checking: 'Checking...',
    connected: `Connected as ${connectedUser}`,
    error: connectionError,
  }

  return (
    <div style={styles.container}>
      {/* Header / toggle */}
      <div style={styles.header} onClick={() => setExpanded((v) => !v)}>
        <span style={styles.headerTitle}>🔗 Push to JIRA</span>
        <span style={{ ...styles.statusDot, backgroundColor: statusColor[connectionStatus] }} />
        <span style={{ ...styles.statusText, color: statusColor[connectionStatus] }}>
          {statusLabel[connectionStatus]}
        </span>
        <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={styles.body}>
          {/* Connect */}
          <div style={styles.row}>
            <button
              onClick={checkConnection}
              disabled={connectionStatus === 'checking'}
              style={{ ...styles.btn, ...styles.connectBtn }}
            >
              {connectionStatus === 'checking' ? 'Connecting...' : 'Test Connection'}
            </button>
            {connectionStatus === 'error' && (
              <span style={styles.errorText}>{connectionError}</span>
            )}
          </div>

          {connectionStatus === 'connected' && (
            <>
              {/* Project selector */}
              <div style={styles.fieldRow}>
                <label style={styles.label}>Project</label>
                {loadingProjects ? (
                  <span style={styles.hint}>Loading projects…</span>
                ) : (
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    style={styles.select}
                    title="Select JIRA project"
                  >
                    {projects.length === 0 && (
                      <option value="">No projects found</option>
                    )}
                    {projects.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} ({p.key})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Issue type selector */}
              <div style={styles.fieldRow}>
                <label style={styles.label}>Issue Type</label>
                <select
                  value={selectedIssueType}
                  onChange={(e) => setSelectedIssueType(e.target.value)}
                  style={styles.select}
                  title="Select issue type"
                >
                  {(issueTypes.length > 0 ? issueTypes : ['Task', 'Story', 'Bug']).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Push button */}
              <div style={styles.row}>
                <button
                  onClick={handlePush}
                  disabled={pushStatus === 'pushing' || !selectedProject || testCases.length === 0}
                  style={{ ...styles.btn, ...styles.pushBtn }}
                >
                  {pushStatus === 'pushing'
                    ? `Pushing ${testCases.length} test cases…`
                    : `Push ${testCases.length} Test Cases to JIRA`}
                </button>
              </div>

              {testCases.length === 0 && (
                <p style={styles.hint}>Generate test cases first, then push them to JIRA.</p>
              )}

              {/* Push error */}
              {pushStatus === 'error' && (
                <p style={styles.errorText}>{pushError}</p>
              )}

              {/* Push results */}
              {pushSummary && pushStatus === 'done' && (
                <div style={styles.summaryBox}>
                  <p style={styles.summaryHeading}>
                    ✅ {pushSummary.totalCreated} created &nbsp;|&nbsp;
                    {pushSummary.totalFailed > 0 && (
                      <span style={{ color: '#e74c3c' }}>❌ {pushSummary.totalFailed} failed</span>
                    )}
                  </p>
                  <div style={styles.resultsTable}>
                    {pushSummary.results.map((r) => (
                      <div key={r.testCaseId} style={styles.resultRow}>
                        <span style={styles.tcId}>{r.testCaseId}</span>
                        {r.status === 'success' ? (
                          <a
                            href={r.jiraUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.jiraLink}
                          >
                            {r.jiraKey} ↗
                          </a>
                        ) : (
                          <span style={styles.failText}>Failed: {r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <p style={styles.hint}>
            Configure <code>JIRA_EMAIL</code>, <code>JIRA_API_TOKEN</code>, and{' '}
            <code>JIRA_PROJECT_KEY</code> in your <code>.env</code> file before connecting.
          </p>
        </div>
      )}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    marginTop: '24px',
    border: '1px solid #dce1e7',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 20px',
    backgroundColor: '#f0f4ff',
    cursor: 'pointer',
    userSelect: 'none',
    borderBottom: '1px solid #dce1e7',
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '15px',
    color: '#2c3e50',
    flex: 1,
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '13px',
    fontWeight: 500,
  },
  chevron: {
    color: '#888',
    fontSize: '12px',
  },
  body: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#444',
    minWidth: '90px',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    fontSize: '14px',
    minWidth: '220px',
    cursor: 'pointer',
  },
  btn: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: 'none',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
  },
  connectBtn: {
    backgroundColor: '#3498db',
    color: '#fff',
  },
  pushBtn: {
    backgroundColor: '#0052CC',
    color: '#fff',
  },
  hint: {
    fontSize: '12px',
    color: '#888',
    marginTop: '4px',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: '13px',
  },
  summaryBox: {
    backgroundColor: '#f4fff8',
    border: '1px solid #a9e6bb',
    borderRadius: '6px',
    padding: '14px 18px',
  },
  summaryHeading: {
    fontWeight: 700,
    fontSize: '15px',
    marginBottom: '10px',
  },
  resultsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
  },
  tcId: {
    fontWeight: 600,
    minWidth: '72px',
    color: '#444',
  },
  jiraLink: {
    color: '#0052CC',
    textDecoration: 'none',
    fontWeight: 500,
  },
  failText: {
    color: '#e74c3c',
  },
}
