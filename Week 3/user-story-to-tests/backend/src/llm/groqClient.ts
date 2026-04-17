import fetch from 'node-fetch'
import { GenerateResponse } from '../schemas'

interface GroqResponse {
  content: string
  model?: string
  promptTokens: number
  completionTokens: number
}

export class GroqClient {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = process.env.groq_API_KEY || ''
      this.baseUrl = process.env.groq_API_BASE || 'https://api.groq.com/openai/v1'
      this.model = process.env.groq_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
      
      if (!this.apiKey) {
        console.warn('groq_API_KEY not found in environment variables')
      } else {
        console.log('Groq API key configured successfully')
        console.log(`Using model: ${this.model}`)
        console.log(`API endpoint: ${this.baseUrl}/chat/completions`)
      }
  }

  async generateTests(systemPrompt: string, userPrompt: string): Promise<GroqResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 4096
    }

    console.log('🚀 Making Groq API call')
    console.log(`📍 Endpoint: ${endpoint}`)
    console.log(`🤖 Model: ${this.model}`)
    console.log(`🧾 Prompt length: ${systemPrompt.length + userPrompt.length} chars`)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60000)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      console.log(`📊 Response status: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.log('❌ Groq error response received')
        throw new Error(`Groq API error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json() as any
      console.log('✅ Groq response received successfully')
      
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('No content received from Groq API')
      }

      // Extract JSON from markdown code blocks if present
      let jsonContent = content
      if (content.includes('```json') || content.includes('```')) {
        // Remove markdown code block wrapper (```json ... ```)
        jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      }

      // Try to parse as JSON to validate
      let parsedContent: GenerateResponse
      try {
        parsedContent = JSON.parse(jsonContent)
      } catch (parseError) {
        throw new Error(`Invalid JSON response from Groq API: ${parseError}`)
      }

      return {
        content: jsonContent,
        model: data.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Groq API request timed out')
      }
      console.error('❌ Error calling Groq API:', (error as Error).message)
      throw error
    }
  }

}