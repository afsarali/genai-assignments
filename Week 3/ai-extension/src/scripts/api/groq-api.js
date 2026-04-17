class GroqAPI {
    constructor(apiKey) {
      this.apiKey = apiKey;
      this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    isLikelyDnsOrNetworkError(error) {
      const message = String(error?.message || '').toLowerCase();
      return message.includes('failed to fetch') || message.includes('networkerror');
    }
  
    // Helper function to extract the entire code block (including the delimiters)
    extractBlock(text) {
      const regex = /```[\s\S]*?```/g;
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        return matches.map(block => block.trim()).join('\n\n');
      }
      return text;
    }       
  
    async sendMessage(prompt, modelName) {
      try {
        if (!this.apiKey || !String(this.apiKey).trim()) {
          throw new Error('Groq API key is missing. Please add a valid key in Settings.');
        }

        if (!modelName || !String(modelName).trim()) {
          throw new Error('No model selected for Groq. Please choose a Groq model in Settings.');
        }

        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{
              role: 'user',
              content: prompt
            }],
            temperature: 0.2
          })
        });
  
        if (!response.ok) {
          const errorData = await response.text();
          console.error('API Response:', response.status, errorData);
          throw new Error(`API call failed: ${response.status} - ${errorData}`);
        }
  
        const data = await response.json();
        console.log('Groq API response:', data);
  
        // Extract the entire code block (with ``` and closing ```)
        const rawContent = data.choices[0].message.content;
        const responseContent = this.extractBlock(rawContent);
  
        return {
          content: responseContent
        };
      } catch (error) {
        console.error('Error calling Groq API:', error);

        if (this.isLikelyDnsOrNetworkError(error)) {
          throw new Error('Cannot reach api.groq.com (network or DNS issue). Verify internet connection, DNS/proxy/firewall, and that api.groq.com is accessible from this machine.');
        }

        throw error;
      }
    }
  }  