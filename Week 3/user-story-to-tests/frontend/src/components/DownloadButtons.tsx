import { GenerateResponse, TestCase } from '../types'

interface DownloadButtonsProps {
  results: GenerateResponse
  storyTitle: string
}

export function DownloadButtons({ results, storyTitle }: DownloadButtonsProps) {
  const generateFileName = (format: string): string => {
    const timestamp = new Date().toISOString().split('T')[0]
    const sanitizedTitle = storyTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    return `${sanitizedTitle}_testcases_${timestamp}.${format}`
  }

  const downloadJSON = () => {
    const dataStr = JSON.stringify(results, null, 2)
    const dataUri = new Blob([dataStr], { type: 'application/json' })
    const exportFileDefaultName = generateFileName('json')
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataUri)
    link.download = exportFileDefaultName
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const downloadCSV = () => {
    let csv = 'Test Case ID,Title,Category,Expected Result,Steps,Test Data\n'
    
    results.cases.forEach((testCase: TestCase) => {
      const stepsText = testCase.steps.join(' | ')
      const testDataText = testCase.testData || 'N/A'
      const row = [
        testCase.id,
        `"${testCase.title.replace(/"/g, '""')}"`,
        testCase.category,
        `"${testCase.expectedResult.replace(/"/g, '""')}"`,
        `"${stepsText.replace(/"/g, '""')}"`,
        `"${testDataText.replace(/"/g, '""')}"`
      ].join(',')
      csv += row + '\n'
    })

    const dataUri = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const exportFileDefaultName = generateFileName('csv')
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataUri)
    link.download = exportFileDefaultName
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const downloadExcel = () => {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Test Cases">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">Test Case ID</Data></Cell>
        <Cell><Data ss:Type="String">Title</Data></Cell>
        <Cell><Data ss:Type="String">Category</Data></Cell>
        <Cell><Data ss:Type="String">Expected Result</Data></Cell>
        <Cell><Data ss:Type="String">Steps</Data></Cell>
        <Cell><Data ss:Type="String">Test Data</Data></Cell>
      </Row>`

    results.cases.forEach((testCase: TestCase) => {
      const stepsText = testCase.steps.join('\n')
      const testDataText = testCase.testData || 'N/A'
      xml += `
      <Row>
        <Cell><Data ss:Type="String">${testCase.id}</Data></Cell>
        <Cell><Data ss:Type="String">${testCase.title}</Data></Cell>
        <Cell><Data ss:Type="String">${testCase.category}</Data></Cell>
        <Cell><Data ss:Type="String">${testCase.expectedResult}</Data></Cell>
        <Cell><Data ss:Type="String">${stepsText}</Data></Cell>
        <Cell><Data ss:Type="String">${testDataText}</Data></Cell>
      </Row>`
    })

    xml += `
    </Table>
  </Worksheet>
</Workbook>`

    const dataUri = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const exportFileDefaultName = generateFileName('xls')
    
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataUri)
    link.download = exportFileDefaultName
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div style={styles.downloadContainer}>
      <h3 style={styles.downloadTitle}>📥 Export Test Cases</h3>
      <div style={styles.buttonGroup}>
        <button 
          onClick={downloadJSON} 
          style={{ ...styles.downloadBtn, ...styles.jsonBtn }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2980b9'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3498db'}
        >
          📄 JSON
        </button>
        <button 
          onClick={downloadCSV} 
          style={{ ...styles.downloadBtn, ...styles.csvBtn }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#229954'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#27ae60'}
        >
          📊 CSV
        </button>
        <button 
          onClick={downloadExcel} 
          style={{ ...styles.downloadBtn, ...styles.excelBtn }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e67e22'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f39c12'}
        >
          📑 Excel
        </button>
      </div>
      <p style={styles.downloadHint}>Files will be downloaded with today's date in the filename</p>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  downloadContainer: {
    marginTop: '30px',
    padding: '25px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    borderTop: '3px solid #3498db',
    textAlign: 'center',
  },
  downloadTitle: {
    marginBottom: '15px',
    color: '#2c3e50',
    fontSize: '18px',
    fontWeight: '600',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  downloadBtn: {
    padding: '12px 24px',
    borderRadius: '6px',
    border: 'none',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  jsonBtn: {
    backgroundColor: '#3498db',
    color: 'white',
  },
  csvBtn: {
    backgroundColor: '#27ae60',
    color: 'white',
  },
  excelBtn: {
    backgroundColor: '#f39c12',
    color: 'white',
  },
  downloadHint: {
    marginTop: '12px',
    color: '#666',
    fontSize: '12px',
    fontStyle: 'italic',
  },
}
